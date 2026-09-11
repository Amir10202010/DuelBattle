import type { Judgement } from '../../shared/judging';
import type { Player } from '../../shared/protocol';

export function AiVerdict({ judgement, players }: { judgement: Judgement; players: Player[] }) {
  return (
    <div className="ai-verdict" aria-label="AI photo assessments">
      {players.map((player) => {
        const assessment = judgement.assessments.find((a) => a.playerId === player.id);
        return (
          <article key={player.id} className={judgement.winnerId === player.id ? 'ai-winner' : ''}>
            <div className="ai-score">
              <strong>{player.name}</strong>
              <b>
                {assessment?.score ?? 0}
                <small>/100</small>
              </b>
            </div>
            {assessment ? (
              <>
                <p className="ai-recognized">
                  Recognized: {assessment.objects.join(', ') || 'No clear object'}
                </p>
                <p>{assessment.reason}</p>
                {assessment.detector && (
                  <p className="ai-detector">
                    {assessment.detector === 'yolov8'
                      ? `YOLOv8: ${assessment.detections?.map((d) => `${d.label} ${Math.round(d.confidence * 100)}%`).join(', ') || 'No familiar objects detected'}`
                      : 'YOLOv8 unavailable · Gemini assessed the photos directly'}
                  </p>
                )}
                <small>
                  {assessment.valid && assessment.confidence >= 0.7
                    ? `Fulfillment ${assessment.fulfillment}/70 · Presentation ${assessment.presentation}/30`
                    : 'Answer not confirmed · 0 points'}
                </small>
              </>
            ) : (
              <p>No photo submitted in time.</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
