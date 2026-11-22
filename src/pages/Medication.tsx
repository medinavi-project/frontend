import { useEffect, useState, type ChangeEvent } from 'react';
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
      <div className="med__head">
        <h1>약봉투 읽어 주기</h1>
        <ol className="med__steps" aria-label="진행 단계">
          <li className={scan ? 'is-done' : 'is-current'}>사진 올리기</li>
          <li className={scan ? 'is-current' : ''}>복약 안내 듣기</li>
        </ol>
      </div>

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
          {scan.medications.map((m, i) => (
            <GuideCard key={m.item_seq} med={m} index={i} total={scan.medications.length} />
          ))}
          {scan.uncertain_medications.length > 0 && (
            <section className="leaflet leaflet--uncertain" aria-labelledby="uncertain-title">
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
          <div className="guides__foot">
            <p className="muted">복용 중 이상하면 약사나 의사와 상의하세요.</p>
            <button className="btn btn--ghost" type="button" onClick={reset}>
              <Icon name="camera" />
              다른 약봉투 읽기
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

type DescKey = keyof MedicationCard['description'];

/** 효능 아래에 이어지는 항목. caption 은 항목 이름 아래 작은 안내 */
const SECTIONS: { key: DescKey; label: string; caption?: string }[] = [
  { key: 'how_to_take', label: '허가된 일반 용법', caption: '허가된 모든 경우를 적은 글이라 실제 처방과 다를 수 있어요.' },
  { key: 'precautions', label: '주의할 점' },
  { key: 'side_effects', label: '이상반응' },
  { key: 'storage', label: '보관 방법' },
];
const ALL_KEYS: DescKey[] = ['purpose', ...SECTIONS.map((s) => s.key)];

const ORDINALS = ['첫', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
const ordinal = (i: number) => `${ORDINALS[i] ?? i + 1} 번째`;

/** 이보다 길면 처음 몇 줄만 보이고 "전체 보기"로 펼친다 */
const LONG_TEXT = 160;

function GuideCard({ med, index, total }: { med: MedicationCard; index: number; total: number }) {
  const d = Object.fromEntries(ALL_KEYS.map((key) => [key, plainText(med.description[key])])) as Record<
    DescKey,
    string | null
  >;
  const unavailable = med.guidance_status === 'UNAVAILABLE' || ALL_KEYS.every((key) => !d[key]);
  const titleId = `med-${index}`;
  return (
    <article className={`leaflet${unavailable ? ' leaflet--empty' : ''}`} aria-labelledby={titleId}>
      <div className="leaflet__head">
        <div>
          <p className="leaflet__order">
            찾은 약 {total}개 중 {ordinal(index)}
          </p>
          <h2 id={titleId}>{med.name}</h2>
        </div>
        {/* 허가된 일반 용법은 실제 처방과 다를 수 있어 읽지 않는다. 효능만 읽는다. */}
        {!unavailable && d.purpose && <TtsPlayer text={`${med.name}. ${d.purpose}`} />}
      </div>
      {med.warning && (
        <p className="error" role="note">
          <Icon name="alert" />
          {med.warning}
        </p>
      )}
      {unavailable ? (
        <p className="muted">이 약은 안내 정보를 찾지 못했어요. 약사에게 물어보세요.</p>
      ) : (
        <>
          <section className="leaflet__lede">
            <h3>효능</h3>
            <p className={d.purpose ? undefined : 'muted'}>{d.purpose ?? '정보가 없어요'}</p>
          </section>
          {SECTIONS.map((s) => (
            <LeafletSection key={s.key} label={s.label} caption={s.caption} text={d[s.key]} />
          ))}
        </>
      )}
    </article>
  );
}

function LeafletSection({ label, caption, text }: { label: string; caption?: string; text: string | null }) {
  const [open, setOpen] = useState(false);
  const long = !!text && text.length > LONG_TEXT;
  const paras = text ? text.split('\n') : [];
  return (
    <section className="leaflet__row">
      <div className="leaflet__label">
        <h3>{label}</h3>
        {caption && <p>{caption}</p>}
      </div>
      <div className="leaflet__body">
        {text ? (
          <div className={long && !open ? 'leaflet__text is-clamped' : 'leaflet__text'}>
            {paras.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : (
          <p className="muted">정보가 없어요</p>
        )}
        {long && (
          <button className="leaflet__more" type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? '접기' : '전체 보기'}
          </button>
        )}
      </div>
    </section>
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
        {speaking ? '멈추기' : '효능 소리로 듣기'}
      </button>
    </div>
  );
}
