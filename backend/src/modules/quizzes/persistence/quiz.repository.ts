import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type {
  Quiz,
  QuizStatus,
  QuizWithQuestions,
  QuestionInput,
  QuestionType,
  StoredQuestion,
} from '../domain/quiz-rules.js';

interface QuizRow {
  id: string;
  title: string;
  description: string | null;
  status: QuizStatus;
  version: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
}

export interface QuizSummary extends Quiz {
  questionCount: number;
}

/**
 * Raw-SQL persistence of quizzes, questions and options (like the publishing repositories: the whole quiz is
 * read and written as a document). Pass `manager` to take part in a transaction.
 */
@Injectable()
export class QuizRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private db(manager?: EntityManager): Pick<EntityManager, 'query'> {
    return manager ?? this.dataSource;
  }

  async insertQuiz(
    input: { title: string; description: string | null; createdBy: string },
    manager: EntityManager,
  ): Promise<string> {
    const [row]: { id: string }[] = await manager.query(
      `INSERT INTO "quizzes" ("title", "description", "created_by") VALUES ($1, $2, $3) RETURNING "id"`,
      [input.title, input.description, input.createdBy],
    );
    return row.id;
  }

  /** Replaces every question and option of the quiz. Ids are generated here; the correct option is by id. */
  async replaceQuestions(
    quizId: string,
    questions: readonly QuestionInput[],
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(`DELETE FROM "quiz_questions" WHERE "quiz_id" = $1`, [
      quizId,
    ]);
    if (questions.length === 0) return;

    const questionRows: {
      id: string;
      position: number;
      prompt: string;
      explanation: string | null;
      correctOptionId: string;
      levels: string[] | null;
    }[] = [];
    const optionRows: {
      id: string;
      questionId: string;
      position: number;
      text: string;
    }[] = [];
    questions.forEach((question, qIndex) => {
      const questionId = randomUUID();
      let correctOptionId = '';
      question.options.forEach((option, oIndex) => {
        const id = randomUUID();
        if (option.correct) correctOptionId = id;
        optionRows.push({
          id,
          questionId,
          position: oIndex + 1,
          text: option.text,
        });
      });
      questionRows.push({
        id: questionId,
        position: qIndex + 1,
        prompt: question.prompt,
        explanation: question.explanation ?? null,
        correctOptionId,
        levels: question.levels ?? null,
      });
    });

    // The questions point at their correct option through a DEFERRED foreign key, so they go in first.
    await manager.query(
      // levels travel as one text per question ('' = every level, otherwise comma-separated) because Postgres cannot unnest a jagged array.
      `INSERT INTO "quiz_questions" ("id", "quiz_id", "position", "prompt", "explanation", "correct_option_id", "levels")
       SELECT v.id, $1, v.position, v.prompt, v.explanation, v.correct,
              CASE WHEN v.levels = '' THEN NULL ELSE string_to_array(v.levels, ',') END
         FROM unnest($2::uuid[], $3::int[], $4::text[], $5::text[], $6::uuid[], $7::text[])
              AS v(id, position, prompt, explanation, correct, levels)`,
      [
        quizId,
        questionRows.map((q) => q.id),
        questionRows.map((q) => q.position),
        questionRows.map((q) => q.prompt),
        questionRows.map((q) => q.explanation),
        questionRows.map((q) => q.correctOptionId),
        questionRows.map((q) => (q.levels ? q.levels.join(',') : '')),
      ],
    );
    await manager.query(
      `INSERT INTO "quiz_options" ("id", "question_id", "position", "text")
       SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::int[], $4::text[])`,
      [
        optionRows.map((o) => o.id),
        optionRows.map((o) => o.questionId),
        optionRows.map((o) => o.position),
        optionRows.map((o) => o.text),
      ],
    );
  }

  /** Changes the title and description and moves the version (a content edit). */
  async touch(
    id: string,
    changes: { title: string; description: string | null },
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      `UPDATE "quizzes" SET "title" = $2, "description" = $3, "version" = "version" + 1, "updated_at" = now() WHERE "id" = $1`,
      [id, changes.title, changes.description],
    );
  }

  async setStatus(
    id: string,
    status: QuizStatus,
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      `UPDATE "quizzes"
          SET "status" = $2::varchar, "published_at" = CASE WHEN $2::varchar = 'PUBLISHED' THEN now() ELSE NULL END,
              "version" = "version" + 1, "updated_at" = now()
        WHERE "id" = $1`,
      [id, status],
    );
  }

  /**
   * Takes a SHARED lock on the quiz row until the transaction ends and returns its version (null if it does not exist). Quiz edits,
   * status changes and deletion take the exclusive lock, so while this is held none of them can happen: a lesson publication reads
   * one consistent quiz, and a lesson block cannot point at a quiz that is being deleted.
   */
  async lockShared(id: string, manager: EntityManager): Promise<number | null> {
    const rows: { version: number }[] = await manager.query(`SELECT "version" FROM "quizzes" WHERE "id" = $1 FOR SHARE`, [id]);
    return rows[0]?.version ?? null;
  }

  /** The quiz row, locked until the transaction ends. */
  async lock(id: string, manager: EntityManager): Promise<Quiz | null> {
    const rows: QuizRow[] = await manager.query(
      `SELECT * FROM "quizzes" WHERE "id" = $1 FOR UPDATE`,
      [id],
    );
    return rows[0] ? toQuiz(rows[0]) : null;
  }

  async find(id: string, manager?: EntityManager): Promise<Quiz | null> {
    const rows: QuizRow[] = await this.db(manager).query(
      `SELECT * FROM "quizzes" WHERE "id" = $1`,
      [id],
    );
    return rows[0] ? toQuiz(rows[0]) : null;
  }

  async findWithQuestions(
    id: string,
    manager?: EntityManager,
  ): Promise<QuizWithQuestions | null> {
    const quiz = await this.find(id, manager);
    if (!quiz) return null;
    return { ...quiz, questions: await this.questionsOf(id, manager) };
  }

  async questionsOf(
    quizId: string,
    manager?: EntityManager,
  ): Promise<StoredQuestion[]> {
    const questions: {
      id: string;
      position: number;
      type: QuestionType;
      prompt: string;
      explanation: string | null;
      correct_option_id: string;
      levels: string[] | null;
    }[] = await this.db(manager).query(
      `SELECT "id", "position", "type", "prompt", "explanation", "correct_option_id", "levels"
         FROM "quiz_questions" WHERE "quiz_id" = $1 ORDER BY "position"`,
      [quizId],
    );
    if (questions.length === 0) return [];
    const options: {
      id: string;
      question_id: string;
      position: number;
      text: string;
    }[] = await this.db(manager).query(
      `SELECT "id", "question_id", "position", "text" FROM "quiz_options"
          WHERE "question_id" = ANY($1::uuid[]) ORDER BY "question_id", "position"`,
      [questions.map((q) => q.id)],
    );
    return questions.map((q) => ({
      id: q.id,
      position: q.position,
      type: q.type,
      prompt: q.prompt,
      explanation: q.explanation,
      correctOptionId: q.correct_option_id,
      levels: q.levels ?? null,
      options: options
        .filter((o) => o.question_id === q.id)
        .map((o) => ({ id: o.id, position: o.position, text: o.text })),
    }));
  }

  async list(
    limit: number,
    offset: number,
  ): Promise<{ items: QuizSummary[]; total: number }> {
    const rows: (QuizRow & { question_count: number })[] =
      await this.dataSource.query(
        `SELECT z.*, (SELECT count(*)::int FROM "quiz_questions" q WHERE q."quiz_id" = z."id") AS "question_count"
         FROM "quizzes" z ORDER BY z."created_at" DESC, z."id" LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
    const [{ total }]: { total: number }[] = await this.dataSource.query(
      `SELECT count(*)::int AS "total" FROM "quizzes"`,
    );
    return {
      items: rows.map((row) => ({
        ...toQuiz(row),
        questionCount: row.question_count,
      })),
      total,
    };
  }

  /** Lessons whose working content has a QUIZ block pointing at this quiz. */
  async countLessonReferences(id: string, manager?: EntityManager): Promise<number> {
    const [row]: { n: number }[] = await this.db(manager).query(
      `SELECT count(DISTINCT "lesson_id")::int AS n FROM "lesson_blocks" WHERE "type" = 'QUIZ' AND "shared_content"->>'quizId' = $1`,
      [id],
    );
    return row?.n ?? 0;
  }

  async delete(id: string, manager: EntityManager): Promise<void> {
    await manager.query(`DELETE FROM "quizzes" WHERE "id" = $1`, [id]);
  }
}

function toQuiz(row: QuizRow): Quiz {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}
