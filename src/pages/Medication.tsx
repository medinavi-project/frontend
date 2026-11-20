import { useEffect, useState, type ChangeEvent } from 'react';
import Icon from '../components/Icon';
import {
  errorMessage,
  getGuide,
  scanMedication,
  type MedicationGuide,
  type MedicationGuideItem,
  type MedicationScan,
} from '../api';

type Step = 'upload' | 'confirm' | 'guide';
/** 약별 선택: item_seq = 고른 약, '' = 안내에서 빼기, undefined = 아직 안 고름 */
type Picks = Record<number, string | undefined>;

export default function Medication() {
  const [step, setStep] = useState<Step>('upload');
  const [preview, setPreview] = useState<string | null>(null);
  const [scan, setScan] = useState<MedicationScan | null>(null);
  const [picked, setPicked] = useState<Picks>({});
  const [guide, setGuide] = useState<MedicationGuide | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일을 다시 골라도 동작하도록
    if (!file || loading) return;
    setPreview(URL.createObjectURL(file));
    setError(null);
    setLoading(true);
    try {
      const res = await scanMedication(file);
      setScan(res);
      // 하나로 찾은 약(MATCHED)만 미리 골라 두고, 사용자가 확인한다. 후보가 여러 개면 직접 고르게 한다.
      setPicked(
        Object.fromEntries(
          res.medications.map((m, i) => [i, m.match_status === 'MATCHED' ? (m.item_seq ?? m.candidates[0]?.item_seq) : undefined]),
        ),
      );
      setStep('confirm');
    } catch (err) {
      setError(errorMessage(err, '사진에서 글자를 읽지 못했어요. 밝은 곳에서 다시 찍어 주세요.'));
    } finally {
      setLoading(false);
    }
  };

  // 찾지 못한 약(NOT_FOUND)은 고를 것이 없으므로 제외
  const choosable = scan?.medications.map((m, i) => ({ m, i })).filter(({ m }) => m.candidates.length > 0) ?? [];
  const undecided = choosable.filter(({ i }) => picked[i] === undefined).length;
  const seqs = choosable.map(({ i }) => picked[i]).filter((s): s is string => !!s);

  const onConfirm = async () => {
    if (seqs.length === 0 || undecided > 0) return;
    setLoading(true);
    setError(null);
    try {
      setGuide(await getGuide(seqs));
      setStep('guide');
    } catch (err) {
      setError(errorMessage(err, '복약 안내를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.'));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    window.speechSynthesis?.cancel();
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
          <p className="muted">사진에서 읽은 글자와 의약품 정보를 비교했어요. 맞는 약을 확인하고, 다르면 바꿔 주세요.</p>
          <details className="med__ocr">
            <summary>사진에서 읽은 글자 전체 보기</summary>
            <p>{scan.recognized_text}</p>
          </details>
          <div className="confirm-list">
            {scan.medications.length === 0 && (
              <p className="muted">사진에서 약 이름을 찾지 못했어요. 약 이름이 잘 보이게 다시 찍어 주세요.</p>
            )}
            {scan.medications.map((m, i) => (
              <fieldset key={i} className="confirm-item">
                <legend>
                  사진에서 읽은 글자: <strong>{m.item_name}</strong>
                </legend>
                {m.match_status === 'NOT_FOUND' ? (
                  <p className="muted">이 이름과 맞는 약을 찾지 못해 안내에서 뺐어요.</p>
                ) : (
                  <>
                    {m.match_status === 'AMBIGUOUS' && <p className="muted">비슷한 약이 여러 개예요. 맞는 약을 골라 주세요.</p>}
                    {m.candidates.map((c) => (
                      <label key={c.item_seq} className="candidate">
                        <input
                          type="radio"
                          name={`item-${i}`}
                          checked={picked[i] === c.item_seq}
                          onChange={() => setPicked((p) => ({ ...p, [i]: c.item_seq }))}
                        />
                        <span>{c.item_name}</span>
                        {c.manufacturer && <span className="muted">{c.manufacturer}</span>}
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
                  </>
                )}
              </fieldset>
            ))}
          </div>
          {undecided > 0 && <p className="muted">아직 고르지 않은 약이 {undecided}개 있어요.</p>}
          <div className="med__actions">
            <button className="btn btn--ghost" type="button" onClick={reset}>
              <Icon name="camera" />
              다시 찍기
            </button>
            <button className="btn" type="button" onClick={onConfirm} disabled={loading || undecided > 0 || seqs.length === 0}>
              {loading ? '안내를 만드는 중' : '복약 안내 보기'}
            </button>
          </div>
        </section>
      )}

      {step === 'guide' && guide && (
        <section className="guides">
          {guide.medications.map((g) => (
            <GuideCard key={g.item_seq} guide={g} />
          ))}
          <p className="muted">쉬운 설명은 공식 정보를 풀어 쓴 것이에요. 복용 중 이상하면 약사나 의사와 상의하세요.</p>
          <button className="btn btn--ghost" type="button" onClick={reset}>
            <Icon name="camera" />
            다른 약봉투 읽기
          </button>
        </section>
      )}
    </div>
  );
}

function GuideCard({ guide }: { guide: MedicationGuideItem }) {
  const src = guide.official_source;
  return (
    <article className="panel guide">
      <h2>{guide.item_name}</h2>
      <p className="guide__summary">{guide.summary}</p>
      <TtsPlayer url={guide.audio_status === 'READY' ? guide.audio_url : null} text={`${guide.item_name}. ${guide.summary}`} />
      <details>
        <summary>자세한 공식 정보</summary>
        <dl className="guide__table">
          <dt>효능</dt>
          <dd>{guide.efficacy ?? '정보가 없어요'}</dd>
          <dt>먹는 법</dt>
          <dd>{guide.usage ?? '정보가 없어요'}</dd>
          <dt>주의할 점</dt>
          <dd>
            {guide.cautions.length === 0 ? (
              '정보가 없어요'
            ) : (
              <ul className="guide__cautions">
                {guide.cautions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
          </dd>
          <dt>출처</dt>
          <dd>
            {src.url ? (
              <a href={src.url} target="_blank" rel="noopener noreferrer">
                {src.organization}
              </a>
            ) : (
              src.organization
            )}
          </dd>
        </dl>
      </details>
    </article>
  );
}

/**
 * 서버 음성(audio_status=READY)이 있으면 재생한다.
 * 없으면 임시로 브라우저 음성 합성으로 읽어 준다 — 네이버 클라우드(CLOVA Voice) 적용 후 제거 (PRD 10-3).
 */
function TtsPlayer({ url, text }: { url: string | null; text: string }) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  if (url) {
    return (
      <div className="guide__tts">
        <span className="tts__label">
          <Icon name="volume" size={24} />
          <strong>음성으로 듣기</strong>
        </span>
        <audio controls src={url} preload="none" />
      </div>
    );
  }

  if (!('speechSynthesis' in window)) return null;

  const toggle = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 0.9;
    u.onend = () => setSpeaking(false);
    synth.speak(u);
    setSpeaking(true);
  };

  return (
    <div className="guide__tts">
      <button className="btn btn--ghost btn--sm" type="button" onClick={toggle} aria-pressed={speaking}>
        <Icon name={speaking ? 'stop' : 'volume'} />
        {speaking ? '멈추기' : '소리로 듣기'}
      </button>
    </div>
  );
}
