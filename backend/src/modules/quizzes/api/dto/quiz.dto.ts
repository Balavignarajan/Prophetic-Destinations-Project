import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  ArrayUnique,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type {
  Answer,
  PublicQuiz,
  QuizInput,
  QuizWithQuestions,
  SubmissionResult,
} from '../../domain/quiz-rules.js';
import { QUESTION_LEVELS, QUIZ_LIMITS } from '../../domain/quiz-rules.js';
import type { QuizSummary } from '../../persistence/quiz.repository.js';

/** Surrounding whitespace is not content; whether what remains is empty is decided by the quiz rules (422). */
const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

export class OptionDto {
  @Trim()
  @IsString()
  @MaxLength(QUIZ_LIMITS.optionTextMax * 2)
  text: string;

  @IsBoolean()
  correct: boolean;
}

export class QuestionDto {
  /** Levels the question is shown at. Absent or null = every level (existing questions have no setting); otherwise at least one. Sent in full on every save. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(QUESTION_LEVELS as unknown as string[], { each: true })
  levels?: string[] | null;

  @Trim()
  @IsString()
  @MaxLength(QUIZ_LIMITS.promptMax * 2)
  prompt: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(QUIZ_LIMITS.explanationMax * 2)
  explanation?: string | null;

  @IsArray()
  @ArrayMaxSize(QUIZ_LIMITS.optionsMax * 2)
  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  options: OptionDto[];
}

export class CreateQuizDto implements QuizInput {
  @Trim()
  @IsString()
  @MaxLength(QUIZ_LIMITS.titleMax * 2)
  title: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(QUIZ_LIMITS.descriptionMax * 2)
  description?: string | null;

  @IsArray()
  @ArrayMaxSize(QUIZ_LIMITS.questionsMax * 2)
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions: QuestionDto[];
}

/** The complete new content of a draft quiz (it replaces the old one), plus the version the editor saw. */
export class UpdateQuizDto extends CreateQuizDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class ListQuizzesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class SubmissionAnswerDto implements Answer {
  @IsUUID()
  questionId: string;

  @IsUUID()
  optionId: string;
}

export class SubmissionDto {
  @IsArray()
  @ArrayMaxSize(QUIZ_LIMITS.questionsMax)
  @ValidateNested({ each: true })
  @Type(() => SubmissionAnswerDto)
  answers: SubmissionAnswerDto[];
}

// ---- responses -------------------------------------------------------------------------------------------------

/** Staff view: includes which option is correct and the explanations. Never sent to learners. */
export class AdminQuizResponseDto {
  id: string;
  title: string;
  description: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  questions: {
    id: string;
    type: string;
    prompt: string;
    explanation: string | null;
    /** Levels the question is shown at, or null = every level. */
    levels: string[] | null;
    options: { id: string; text: string; correct: boolean }[];
  }[];

  static from(quiz: QuizWithQuestions): AdminQuizResponseDto {
    return {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      status: quiz.status,
      version: quiz.version,
      createdBy: quiz.createdBy,
      createdAt: quiz.createdAt.toISOString(),
      updatedAt: quiz.updatedAt.toISOString(),
      publishedAt: quiz.publishedAt?.toISOString() ?? null,
      questions: quiz.questions.map((question) => ({
        id: question.id,
        type: question.type,
        prompt: question.prompt,
        explanation: question.explanation,
        levels: question.levels,
        options: question.options.map((option) => ({
          id: option.id,
          text: option.text,
          correct: option.id === question.correctOptionId,
        })),
      })),
    };
  }
}

export class QuizSummaryDto {
  id: string;
  title: string;
  description: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  version: number;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;

  static from(quiz: QuizSummary): QuizSummaryDto {
    return {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      status: quiz.status,
      version: quiz.version,
      questionCount: quiz.questionCount,
      createdAt: quiz.createdAt.toISOString(),
      updatedAt: quiz.updatedAt.toISOString(),
      publishedAt: quiz.publishedAt?.toISOString() ?? null,
    };
  }
}

export class QuizListResponseDto {
  items: QuizSummaryDto[];
  total: number;
  limit: number;
  offset: number;
}

export type PublicQuizResponseDto = PublicQuiz;
export type SubmissionResultDto = SubmissionResult;
