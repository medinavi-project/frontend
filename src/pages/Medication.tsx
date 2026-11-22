import { Fragment, useEffect, useState, type ChangeEvent } from 'react';
import Icon from '../components/Icon';
import { errorMessage, scanMedication, type MedicationCard, type MedicationScan } from '../api';
import { plainText } from '../utils/text';

export default function Medication() {
  const [preview, setPreview] = useState<string | null>(null);
  const [scan, setScan] = useState<MedicationScan | null>(null);
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
      setScan(await scanMedication(file));
    } catch (err) {
      setError(errorMessage(err, '사진에서 글자를 읽지 못했어요. 밝은 곳에서 다시 찍어 주세요.'));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    window.speechSynthesis?.cancel();
    setPreview(null);
    setScan(null);
    setError(null);
  };

  return (
    <div className="container med">
      <h1>약봉투 읽어 주기</h1>
      <ol className="med__steps" aria-label="진행 단계">
        <li className={scan ? 'is-done' : 'is-current'}>사진 올리기</li>
        <li className={scan ? 'is-current' : ''}>복약 안내 듣기</li>
      </ol>

      {error && (
        <p className="error" role="alert">
          <Icon name="alert" />
          {error}
        </p>
      )}

      {!scan && (
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
              {loading ? '글자를 읽고 안내를 만드는 중' : '사진 찍거나 고르기'}
            </span>
          </label>
        </section>
      )}

      {scan && (
        <section className="guides">
          {scan.medications.length === 0 && scan.uncertain_medications.length === 0 && (
            <p className="muted">사진에서 약 이름을 찾지 못했어요. 약 이름이 잘 보이게 다시 찍어 주세요.</p>
          )}
          {scan.medications.length > 0 && (
            <p className="med__notice" role="note">
              <Icon name="alert" />
              실제 복용법은 약봉투와 약사 안내를 따르세요.
            </p>
          )}
          {scan.medications.map((m) => (
            <GuideCard key={m.item_seq} med={m} />
          ))}
          {scan.uncertain_medications.length > 0 && (
            <section className="panel" aria-labelledby="uncertain-title">
              <h2 id="uncertain-title">확실히 찾지 못한 약</h2>
              {scan.uncertain_medications.map((u, i) => (
                <div key={i}>
                  <p>
                    사진에서 읽은 글자: <strong>{u.recognized_name}</strong>
                  </p>
                  <p className="muted">{u.reason}</p>
                  <p>{u.action_message}</p>
                </div>
              ))}
            </section>
          )}
          <p className="muted">복용 중 이상하면 약사나 의사와 상의하세요.</p>
          <button className="btn btn--ghost" type="button" onClick={reset}>
            <Icon name="camera" />
            다른 약봉투 읽기
          </button>
        </section>
      )}
    </div>
  );
}

const FIELDS: [keyof MedicationCard['description'], string][] = [
  ['purpose', '효능'],
  ['how_to_take', '허가된 일반 용법'],
  ['precautions', '주의할 점'],
  ['side_effects', '이상반응'],
  ['storage', '보관 방법'],
];

function GuideCard({ med }: { med: MedicationCard }) {
  const d = Object.fromEntries(FIELDS.map(([key]) => [key, plainText(med.description[key])])) as Record<
    (typeof FIELDS)[number][0],
    string | null
  >;
  // 허가된 일반 용법은 실제 처방과 다를 수 있어 읽지 않는다. 효능만 읽는다.
  const speech = d.purpose;
  return (
    <article className="panel guide">
      <h2>{med.name}</h2>
      {med.warning && (
        <p className="error" role="note">
          <Icon name="alert" />
          {med.warning}
        </p>
      )}
      {med.guidance_status === 'UNAVAILABLE' || FIELDS.every(([key]) => !d[key]) ? (
        <p className="muted">이 약은 안내 정보를 찾지 못했어요. 약사에게 물어보세요.</p>
      ) : (
        <>
          {speech && <TtsPlayer text={`${med.name}. ${speech}`} />}
          <dl className="guide__table">
            {FIELDS.map(([key, label]) => (
              <Fragment key={key}>
                <dt>{label}</dt>
                <dd>{d[key] ?? '정보가 없어요'}</dd>
              </Fragment>
            ))}
          </dl>
        </>
      )}
    </article>
  );
}

/**
 * 서버 음성이 계약에서 빠져, 임시로 브라우저 음성 합성으로 읽어 준다 — 네이버 클라우드(CLOVA Voice) 적용 후 제거 (PRD 10-3).
 */
function TtsPlayer({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

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
