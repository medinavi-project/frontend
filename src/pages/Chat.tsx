import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  createSession,
  getResult,
  sendMessage,
  MAX_TURNS,
  SLOT_META,
  type ChatResult,
  type SlotKey,
  type Slots,
} from '../api';
import EmergencyBanner from '../components/EmergencyBanner';
import Icon from '../components/Icon';

interface Message {
  id: number;
  role: 'bot' | 'user';
  text: string;
}

let msgId = 0;
const bot = (text: string): Message => ({ id: ++msgId, role: 'bot', text });
const user = (text: string): Message => ({ id: ++msgId, role: 'user', text });

/** 고령층이 타이핑 없이 답할 수 있도록 슬롯별 빠른 답변 */
const QUICK: Partial<Record<SlotKey, string[]>> = {
  main_symptom: ['배가 아파요', '머리가 아파요', '열이 나요', '기침이 나요'],
  onset: ['오늘부터', '어제부터', '2~3일 전부터', '일주일 넘게'],
  accompanying: ['열이 있어요', '토했어요', '설사해요', '어지러워요', '없어요'],
  age_history: ['20~30대, 없음', '40~50대, 없음', '60대 이상, 고혈압', '60대 이상, 당뇨'],
};
const REQUIRED = SLOT_META.filter((s) => s.required);

export default function Chat() {
  const location = useLocation();
  const initial = (location.state as { initial?: string } | null)?.initial;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [slots, setSlots] = useState<Slots>({});
  const [turn, setTurn] = useState(0);
  const [redFlag, setRedFlag] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ChatResult | null>(null);
  const [input, setInput] = useState('');
  const started = useRef(false);
  const booted = useRef(false);
  const logEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 지금 묻고 있는 슬롯 = 비어 있는 첫 필수 슬롯 (빠른 답변 표시용)
  const asking = REQUIRED.find((s) => !slots[s.key])?.key;
  const filledCount = REQUIRED.filter((s) => slots[s.key]).length;

  const send = async (sid: string, text: string) => {
    setMessages((m) => [...m, user(text)]);
    setPending(true);
    setError(null);
    try {
      const res = await sendMessage(sid, text);
      setMessages((m) => [...m, bot(res.reply)]);
      setSlots(res.slots);
      setTurn(res.turn_count);
      setRedFlag(res.red_flag);
      setDone(res.done);
      if (res.done && !res.red_flag) setResult(await getResult(sid));
    } catch (e) {
      setError(e instanceof Error ? e.message : '응답을 받지 못했어요. 잠시 뒤 다시 보내 주세요.');
    } finally {
      setPending(false);
    }
  };

  const start = async () => {
    setMessages([]);
    setSlots({});
    setTurn(0);
    setRedFlag(false);
    setDone(false);
    setResult(null);
    setError(null);
    setPending(true);
    try {
      const s = await createSession();
      setSessionId(s.session_id);
      setMessages([bot(s.greeting)]);
      setPending(false);
      if (initial && !started.current) {
        started.current = true;
        await send(s.session_id, initial);
      }
    } catch (e) {
      setPending(false);
      setError(e instanceof Error ? e.message : '상담을 시작하지 못했어요. 새로고침해 주세요.');
    }
  };

  useEffect(() => {
    // StrictMode 개발 모드의 effect 이중 실행으로 세션이 두 번 생기지 않게 막음
    if (booted.current) return;
    booted.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, pending, result]);

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || !sessionId || pending || done) return;
    setInput('');
    void send(sessionId, t);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(input);
  };

  const quick = asking && !done && !pending ? QUICK[asking] : undefined;
  const showScale = asking === 'severity' && !done && !pending;

  return (
    <div className="container chat">
      <div className="chat__main">
        <div className="chat__head">
          <h1>증상 상담</h1>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              started.current = true;
              void start();
            }}
          >
            <Icon name="restart" />
            상담 다시 시작
          </button>
        </div>

        <div className="chat__log" aria-live="polite" aria-relevant="additions">
          {messages.map((m) => (
            <div key={m.id} className={`bubble bubble--${m.role}`}>
              <span className="visually-hidden">{m.role === 'bot' ? '메디나비: ' : '나: '}</span>
              {m.text}
            </div>
          ))}
          {pending && (
            <div className="bubble bubble--bot bubble--typing" role="status" aria-label="답변을 쓰는 중">
              <span />
              <span />
              <span />
            </div>
          )}
          <div ref={logEnd} />
        </div>

        {error && (
          <p className="error" role="alert">
            <Icon name="alert" />
            {error}
          </p>
        )}
        {redFlag && <EmergencyBanner />}
        {result && <ResultCard result={result} />}

        {!done && (
          <div className="composer">
            {showScale && (
              <div className="scale" role="group" aria-label="아픈 정도 0부터 10">
                <div className="scale__buttons">
                  {Array.from({ length: 11 }, (_, i) => (
                    <button key={i} type="button" onClick={() => submit(`${i}점`)} aria-label={`${i}점`}>
                      {i}
                    </button>
                  ))}
                </div>
                <div className="scale__ends muted" aria-hidden="true">
                  <span>안 아파요</span>
                  <span>참을 수 없어요</span>
                </div>
              </div>
            )}
            {quick && (
              <ul className="chips" aria-label="빠른 답변">
                {quick.map((q) => (
                  <li key={q}>
                    <button type="button" className="chip" onClick={() => submit(q)}>
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form className="chat__form" onSubmit={onSubmit}>
              <label htmlFor="chat-input" className="visually-hidden">
                답변 입력
              </label>
              <input
                ref={inputRef}
                id="chat-input"
                autoComplete="off"
                placeholder="직접 적어도 돼요"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={!sessionId}
              />
              <button
                className="btn chat__send"
                type="submit"
                disabled={!input.trim() || pending || !sessionId}
                aria-label="답변 보내기"
              >
                <Icon name="send" />
                <span className="chat__send-label">보내기</span>
              </button>
            </form>
          </div>
        )}
      </div>

      <aside className="chat__side panel" aria-label="문진 진행 상황">
        <div className="side__head">
          <h2 className="side__title">지금까지 들은 내용</h2>
          <span className="muted side__turn">
            질문 {Math.min(turn, MAX_TURNS)}/{MAX_TURNS}
          </span>
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={REQUIRED.length}
          aria-valuenow={filledCount}
          aria-label={`필수 항목 ${REQUIRED.length}개 중 ${filledCount}개 확인`}
        >
          <span style={{ width: `${(filledCount / REQUIRED.length) * 100}%` }} />
        </div>
        <dl className="slots">
          {SLOT_META.map((s) => {
            const v = slots[s.key];
            const isAsking = s.key === asking && !done;
            return (
              <div key={s.key} className={`slot${v ? ' is-filled' : ''}${isAsking ? ' is-asking' : ''}`}>
                <dt>
                  {v && <Icon name="check" size="0.9em" />}
                  {s.label}
                  {!s.required && <span className="muted"> (선택)</span>}
                </dt>
                <dd>{v ?? (isAsking ? '여쭤보는 중' : '아직 몰라요')}</dd>
              </div>
            );
          })}
        </dl>
      </aside>
    </div>
  );
}

function ResultCard({ result }: { result: ChatResult }) {
  const params = new URLSearchParams({ dept: result.department });
  if (result.lat != null && result.lng != null) {
    params.set('lat', String(result.lat));
    params.set('lng', String(result.lng));
  }
  return (
    <section className="result" aria-labelledby="result-title">
      <div className="result__head">
        <div className="result__title">
          <span className="result__kicker">추천 진료과</span>
          <h2 id="result-title" className="result__dept">
            {result.department}
          </h2>
          <p className="result__summary muted">{result.summary}</p>
        </div>
        <Link className="btn" to={`/hospitals?${params}`}>
          <Icon name="pin" />
          지금 문 연 {result.department} 찾기
        </Link>
      </div>
      <div className="result__body">
        <div>
          <h3>의심되는 질환</h3>
          <ul className="result__diseases">
            {result.diseases.map((d) => (
              <li key={d.name}>
                <strong>{d.name}</strong>
                <span className="muted">{d.reason}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>
            <Icon name="doc" /> 근거 문서
          </h3>
          <ul className="result__evidence">
            {result.evidence.map((e) => (
              <li key={e.doc_id}>
                <span className="muted">질병관리청 국가건강정보포털 · {e.disease_name}</span>
                <p>{e.snippet}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
