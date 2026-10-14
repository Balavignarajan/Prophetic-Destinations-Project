import type { QuizResult } from '../progress';
import type { Daniel2Lesson, Scene, SceneId } from '../types';
import { EvidenceSceneView } from './evidence-scene';
import { KingdomSceneView } from './kingdom-scene';
import { IntroSceneView, NarrativeSceneView } from './narrative-scene';
import { QuizSceneView } from './quiz-scene';
import { StatueSceneView } from './statue-scene';
import { StoneSceneView } from './stone-scene';
import { SummarySceneView } from './summary-scene';
import { TimelineSceneView } from './timeline-scene';

export type SceneContext = {
  lesson: Daniel2Lesson;
  quizResult: QuizResult | null;
  onQuizFinish: (result: QuizResult) => void;
  onRetakeQuiz: () => void;
  onOpenScene: (id: SceneId) => void;
  onRestart: () => void;
};

/** Picks the view for a scene by its kind. Adding a kind means adding a type, a view and one case here. */
export function SceneRenderer({ scene, ctx }: { scene: Scene; ctx: SceneContext }) {
  switch (scene.kind) {
    case 'intro':
      return <IntroSceneView scene={scene} />;
    case 'narrative':
      return <NarrativeSceneView scene={scene} />;
    case 'statue':
      return <StatueSceneView scene={scene} lesson={ctx.lesson} />;
    case 'kingdom':
      return <KingdomSceneView scene={scene} lesson={ctx.lesson} />;
    case 'stone':
      return <StoneSceneView scene={scene} lesson={ctx.lesson} />;
    case 'timeline':
      return <TimelineSceneView scene={scene} lesson={ctx.lesson} onOpenScene={ctx.onOpenScene} />;
    case 'evidence':
      return <EvidenceSceneView scene={scene} />;
    case 'quiz':
      return (
        <QuizSceneView
          scene={scene}
          lesson={ctx.lesson}
          result={ctx.quizResult}
          onFinish={ctx.onQuizFinish}
          onRetake={ctx.onRetakeQuiz}
          onReview={ctx.onOpenScene}
        />
      );
    case 'summary':
      return (
        <SummarySceneView
          scene={scene}
          quizResult={ctx.quizResult}
          onOpenScene={ctx.onOpenScene}
          onRetakeQuiz={() => {
            ctx.onRetakeQuiz();
            ctx.onOpenScene('quiz');
          }}
          onRestart={ctx.onRestart}
        />
      );
  }
}
