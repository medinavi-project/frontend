import { useEffect, useState, type ChangeEvent } from 'react';
import Icon from '../components/Icon';
import { getGuide, scanMedication, type DrugGuide, type GuideResponse, type ScanResponse } from '../api';

type Step = 'upload' | 'confirm' | 'guide';

export default function Medication() {
  const [step, setStep] = useState<Step>('upload');
  const [preview, setPreview] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [guide, setGuide] = useState<GuideResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setError(null);
    setLoading(true);
    try {
      const res = await scanMedication(file);
      setScan(res);
      // 후보가 1개면 자동 확정, 여러 개면 가장 유사한 것을 기본 선택
      setPicked(Object.fromEntries(res.items.map((it, i) => [i, it.candidates[0]?.item_seq ?? ''])));
      setStep('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : '사진에서 글자를 읽지 못했습니다. 밝은 곳에서 다시 찍어 주세요.');
    } finally {
      setLoading(false);
    }
  };

  const onConfirm = async () => {
    const seqs = Object.values(picked).filter(Boolean);
    if (seqs.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      setGuide(await getGuide(seqs));
      setStep('guide');
    } catch (err) {
      setError(err instanceof Error ? err.message : '복약 안내를 만들지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep('upload');
    setPreview(null);
    setScan(null);
    setGuide(null);
    setPicked({});
    setError(null);
  };

  return (
    <div className="container med">
      <h1>약봉투 읽어 주기</h1>
      <ol className="med__steps" aria-label="진행 단계">
        <li className={step === 'upload' ? 'is-current' : 'is-done'}>사진 올리기</li>
        <li className={step === 'confirm' ? 'is-current' : step === 'guide' ? 'is-done' : ''}>약 이름 확인</li>
        <li className={step === 'guide' ? 'is-current' : ''}>복약 안내 듣기</li>
      </ol>

      {error && (
        <p className="error" role="alert">
          <Icon name="alert" />
          {error}
        </p>
      )}

      {step === 'upload' && (
        <section className="panel med__upload">
          <label className="dropzone">
            <input type="file" accept="image/*" capture="environment" onChange={onFile} disabled={loading} />
            {preview ? (
              <img src={preview} alt="올린 약봉투 사진" />
            ) : (
              <>
                <span className="dropzone__icon">
                  <Icon name="camera" size={36} />
                </span>
                <strong>약봉투나 처방전을 찍어 주세요</strong>
                <span className="muted">글자가 잘 보이도록 밝은 곳에서, 봉투 전체가 나오게 찍으면 정확해요.</span>
              </>
            )}
            <span className="btn" aria-hidden="true">
              {loading ? <span className="spinner" /> : <Icon name="camera" />}
              {loading ? '글자를 읽는 중' : '사진 찍거나 고르기'}
            </span>
          </label>
        </section>
      )}

      {step === 'confirm' && scan && (
        <section className="panel">
          <h2>이 약이 맞나요?</h2>
          <p className="muted">사진에서 읽은 글자와 식약처 의약품 정보를 비교했어요. 다르면 맞는 약을 골라 주세요.</p>
          <div className="confirm-list">
            {scan.items.map((it, i) => (
              <fieldset key={i} className="confirm-item">
                <legend>
                  사진에서 읽은 글자: <strong>{it.ocr_text}</strong>
                </legend>
                {it.candidates.map((c) => (
                  <label key={c.item_seq} className="candidate">
                    <input
                      type="radio"
                      name={`item-${i}`}
                      checked={picked[i] === c.item_seq}
                      onChange={() => setPicked((p) => ({ ...p, [i]: c.item_seq }))}
                    />
                    <span>{c.item_name}</span>
                    {it.candidates.length > 1 && <span className="muted">일치도 {Math.round(c.score * 100)}%</span>}
                  </label>
                ))}
                <label className="candidate">
                  <input
                    type="radio"
                    name={`item-${i}`}
                    checked={picked[i] === ''}
                    onChange={() => setPicked((p) => ({ ...p, [i]: '' }))}
                  />
                  <span className="muted">이 중에 없어요 (안내에서 빼기)</span>
                </label>
              </fieldset>
            ))}
          </div>
          <div className="med__actions">
            <button className="btn btn--ghost" type="button" onClick={reset}>
              <Icon name="camera" />
              다시 찍기
            </button>
            <button className="btn" type="button" onClick={onConfirm} disabled={loading || !Object.values(picked).some(Boolean)}>
              {loading ? '안내를 만드는 중' : '복약 안내 보기'}
            </button>
          </div>
        </section>
      )}

      {step === 'guide' && guide && (
        <section className="guides">
          <TtsPlayer url={guide.tts_url} text={guide.guides.map((g) => `${g.item_name}. ${g.summary.join(' ')}`).join(' ')} />
          {guide.guides.map((g) => (
            <GuideCard key={g.item_seq} guide={g} />
          ))}
          <p className="muted">출처: 식품의약품안전처 의약품개요정보(e약은요). 복용 중 이상하면 약사나 의사와 상의하세요.</p>
          <button className="btn btn--ghost" type="button" onClick={reset}>
            <Icon name="camera" />
            다른 약봉투 읽기
          </button>
        </section>
      )}
    </div>
  );
}

function GuideCard({ guide }: { guide: DrugGuide }) {
  return (
    <article className="panel guide">
      <h2>{guide.item_name}</h2>
      <ol className="guide__summary">
        {guide.summary.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
      <details>
        <summary>자세한 공식 정보</summary>
        <dl className="guide__table">
          <dt>효능</dt>
          <dd>{guide.efficacy}</dd>
          <dt>먹는 법</dt>
          <dd>{guide.usage}</dd>
          <dt>주의할 점</dt>
          <dd>{guide.caution}</dd>
          <dt>같이 먹으면 안 되는 것</dt>
          <dd>{guide.interaction}</dd>
        </dl>
      </details>
    </article>
  );
}

/** CLOVA Voice mp3 가 있으면 재생, 없으면(목업·개발 중) 브라우저 음성 합성으로 대체 */
function TtsPlayer({ url, text }: { url: string | null; text: string }) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  if (url) {
    return (
      <div className="panel tts">
        <span className="tts__label">
          <Icon name="volume" size={28} />
          <strong>음성으로 듣기</strong>
        </span>
        <audio controls src={url} preload="none" />
      </div>
    );
  }

  const toggle = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 0.9;
    u.onend = () => setSpeaking(false);
    synth.speak(u);
    setSpeaking(true);
  };

  return (
    <div className="panel tts">
      <span className="tts__label">
        <Icon name="volume" size={28} />
        <strong>음성으로 듣기</strong>
      </span>
      <button className="btn" type="button" onClick={toggle} aria-pressed={speaking}>
        <Icon name={speaking ? 'stop' : 'volume'} />
        {speaking ? '멈추기' : '안내 듣기'}
      </button>
    </div>
  );
}
