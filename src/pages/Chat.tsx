import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ApiError,
  createSession,
  errorMessage,
  getResult,
  sendMessage,
  type AnalysisResult,
  type AssessmentStatus,
  type ChatResult,
  type ChatStatus,
  type Question,
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

const GREETING = '안녕하세요. 어디가 어떻게 불편하세요?';
/** 분석 결과를 자동으로 확인하는 최대 시간. 넘으면 멈추고 "결과 다시 확인하기"를 보여 준다 (백엔드 계약상 TBD) */
const POLL_LIMIT_MS = 60_000;
const DEFAULT_POLL_SEC = 2;

/** 화면 단계: intro = 첫 증상 입력 전, ended = 세션 만료 등으로 더 진행할 수 없음 */
type Phase = 'intro' | ChatStatus | 'ended';

export default function Chat() {
  const location = useLocation();
  const initial = (location.state as { initial?: string } | null)?.initial?.trim();

  const [phase, setPhase] = useState<Phase>('intro');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [messages, setMessages] = useState<Message[]>([bot(GREETING)]);
  const [symptom, setSymptom] = useState<string | null>(null);
  const [turn, setTurn] = useState(0);
  const [guidance, setGuidance] = useState<string | null>(null);
  const [result, setResult] = useState<{ assessment: AssessmentStatus | null; result: AnalysisResult } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollStopped, setPollStopped] = useState(false);
  const [input, setInput] = useState('');

  const booted = useRef(false);
  const currentSid = useRef<string | null>(null); // 다시 시작한 뒤 이전 상담의 늦은 응답을 무시하기 위함
  const pollTimer = useRef<number | null>(null);
  const pollUntil = useRef(0);
  const logEnd = useRef<HTMLDivElement>(null);

  const stopPolling = () => {
    if (pollTimer.current != null) window.clearTimeout(pollTimer.current);
    pollTimer.current = null;
  };
  useEffect(() => stopPolling, []);

  /** 결과 조회 응답을 화면 상태에 반영. 계속 기다려야 하면 true */
  const applyResult = useCallback((r: ChatResult): boolean => {
    if (r.status === 'COMPLETED' && r.result) {
      setResult({ assessment: r.assessment_status, result: r.result });
      setPhase('COMPLETED');
      return false;
    }
    if (r.status === 'ANALYZING') {
      setPhase('ANALYZING');
      return true;
    }
    setPhase(r.status);
    if (r.status === 'FAILED') setError('결과를 분석하지 못했어요. "상담 다시 시작"을 눌러 새로 상담해 주세요.');
    return false;
  }, []);

  const failFromError = useCallback((e: unknown, fallback: string) => {
    if (e instanceof ApiError) {
      if (e.code === 'SESSION_NOT_FOUND') {
        setPhase('ended');
        setError('상담 시간이 지나 이어서 진행할 수 없어요. "상담 다시 시작"을 눌러 주세요.');
        return;
      }
      // 분석 실패는 data 에 FAILED 상태를 담아 온다
      const d = e.data as Partial<ChatResult> | null;
      if (d && d.status === 'FAILED') {
        setPhase('FAILED');
        setError(`${e.message} "상담 다시 시작"을 눌러 새로 상담해 주세요.`);
        return;
      }
    }
    setError(errorMessage(e, fallback));
  }, []);

  const poll = useCallback(
    (sid: string, delaySec: number) => {
      stopPolling();
      setPollStopped(false);
      pollTimer.current = window.setTimeout(async () => {
        try {
          const r = await getResult(sid);
          if (sid !== currentSid.current) return;
          if (!applyResult(r)) return;
          if (Date.now() >= pollUntil.current) {
            setPollStopped(true);
            return;
          }
          poll(sid, r.retry_after_seconds ?? DEFAULT_POLL_SEC);
        } catch (e) {
          if (sid !== currentSid.current) return;
          setPollStopped(true);
          failFromError(e, '결과를 확인하지 못했어요. "결과 다시 확인하기"를 눌러 주세요.');
        }
      }, delaySec * 1000);
    },
    [applyResult, failFromError],
  );

  const startPolling = (sid: string, delaySec = DEFAULT_POLL_SEC) => {
    pollUntil.current = Date.now() + POLL_LIMIT_MS;
    setPhase('ANALYZING');
    poll(sid, delaySec);
  };

  const recheck = () => {
    if (!sessionId) return;
    setError(null);
    startPolling(sessionId, 0);
  };

  /** 첫 증상으로 세션 생성 */
  const begin = async (text: string) => {
    setMessages((m) => [...m, user(text)]);
    setSymptom(text);
    setPending(true);
    setError(null);
    try {
      const s = await createSession(text);
      currentSid.current = s.session_id;
      setSessionId(s.session_id);
      setTurn(s.turn_count);
      setQuestion(s.next_question);
      setPhase(s.status);
      setMessages((m) => [...m, bot(s.next_question.text)]);
    } catch (e) {
      // 입력을 되돌려 다시 보낼 수 있게 한다
      setMessages((m) => m.slice(0, -1));
      setSymptom(null);
      setInput(text);
      setError(errorMessage(e, '상담을 시작하지 못했어요. 잠시 뒤 다시 보내 주세요.'));
    } finally {
      setPending(false);
    }
  };

  /** 현재 질문에 대한 답변 전송 */
  const answer = async (sid: string, q: Question, text: string) => {
    setMessages((m) => [...m, user(text)]);
    setPending(true);
    setError(null);
    try {
      const res = await sendMessage(sid, q.question_id, text);
      if (sid !== currentSid.current) return;
      setTurn(res.turn_count);
      setQuestion(res.next_question);
      setPhase(res.status);
      if (res.status === 'IN_PROGRESS' && res.next_question) {
        setMessages((m) => [...m, bot(res.next_question!.text)]);
      } else {
        setMessages((m) => [...m, bot(res.assistant_message)]);
      }
      if (res.status === 'EMERGENCY') setGuidance(res.emergency_guidance);
      if (res.status === 'ANALYZING') startPolling(sid, res.retry_after_seconds ?? DEFAULT_POLL_SEC);
      if (res.status === 'COMPLETED') startPolling(sid, 0);
      if (res.status === 'FAILED') setError('결과를 분석하지 못했어요. "상담 다시 시작"을 눌러 새로 상담해 주세요.');
    } catch (e) {
      if (sid !== currentSid.current) return;
      if (e instanceof ApiError) {
        if (e.code === 'SESSION_ALREADY_COMPLETED') return startPolling(sid, 0);
        if (e.code === 'SESSION_ANALYSIS_IN_PROGRESS' || e.code === 'SESSION_TURN_LIMIT_EXCEEDED') {
          setQuestion(null);
          return startPolling(sid, 0);
        }
      }
      // 같은 질문·같은 답변은 서버가 중복 처리하지 않으므로, 입력을 되돌려 사용자가 직접 다시 보내게 한다
      setMessages((m) => m.slice(0, -1));
      setInput(text);
      failFromError(e, '답변을 보내지 못했어요. 잠시 뒤 다시 보내 주세요.');
    } finally {
      setPending(false);
    }
  };

  const restart = () => {
    stopPolling();
    currentSid.current = null;
    setPhase('intro');
    setSessionId(null);
    setQuestion(null);
    setMessages([bot(GREETING)]);
    setSymptom(null);
    setTurn(0);
    setGuidance(null);
    setResult(null);
    setError(null);
    setPollStopped(false);
    setInput('');
  };

  useEffect(() => {
    // 홈에서 입력한 증상이 있으면 바로 상담 시작 (StrictMode 이중 실행 방지)
    if (booted.current) return;
    booted.current = true;
    if (initial) void begin(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, pending, result, phase]);

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || pending) return;
    if (phase === 'intro') {
      setInput('');
      void begin(t);
    } else if (phase === 'IN_PROGRESS' && sessionId && question) {
      setInput('');
      void answer(sessionId, question, t);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(input);
  };

  const canType = phase === 'intro' || phase === 'IN_PROGRESS';
  const choices = phase === 'IN_PROGRESS' && !pending && question?.answer_type === 'SINGLE_CHOICE' ? question.options : [];

  return (
    <div className="container chat">
      <div className="chat__main">
        <div className="chat__head">
          <h1>증상 상담</h1>
          <button type="button" className="btn btn--ghost btn--sm" onClick={restart}>
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
          {phase === 'ANALYZING' && !pollStopped && (
            <p className="muted" role="status">
              <span className="spinner" /> 말씀해 주신 내용으로 결과를 정리하고 있어요
            </p>
          )}
          <div ref={logEnd} />
        </div>

        {error && (
          <p className="error" role="alert">
            <Icon name="alert" />
            {error}
          </p>
        )}
        {phase === 'ANALYZING' && pollStopped && (
          <div className="chat__wait">
            {!error && <p className="muted">결과를 정리하는 데 시간이 걸리고 있어요. 잠시 뒤 다시 확인해 주세요.</p>}
            <button type="button" className="btn" onClick={recheck}>
              <Icon name="restart" />
              결과 다시 확인하기
            </button>
          </div>
        )}
        {phase === 'EMERGENCY' && <EmergencyBanner message={guidance ?? undefined} />}
        {phase === 'COMPLETED' && result && <ResultCard assessment={result.assessment} result={result.result} />}

        {canType && (
          <div className="composer">
            {choices.length > 0 && (
              <ul className="chips" aria-label="빠른 답변">
                {choices.map((c) => (
                  <li key={c}>
                    <button type="button" className="chip" onClick={() => submit(c)}>
                      {c}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form className="chat__form" onSubmit={onSubmit}>
              <label htmlFor="chat-input" className="visually-hidden">
                {phase === 'intro' ? '증상 입력' : '답변 입력'}
              </label>
              <input
                id="chat-input"
                autoComplete="off"
                placeholder={phase === 'intro' ? '예: 어제부터 배가 아파요' : '직접 적어도 돼요'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button className="btn chat__send" type="submit" disabled={!input.trim() || pending} aria-label="답변 보내기">
                <Icon name="send" />
                <span className="chat__send-label">보내기</span>
              </button>
            </form>
          </div>
        )}
      </div>

      <aside className="chat__side panel" aria-label="상담 진행 상황">
        <div className="side__head">
          <h2 className="side__title">상담 진행 상황</h2>
        </div>
        <dl className="slots">
          <div className={`slot${symptom ? ' is-filled' : ''}`}>
            <dt>처음 말씀하신 증상</dt>
            <dd>{symptom ?? '아직 몰라요'}</dd>
          </div>
          <div className={`slot${turn > 0 ? ' is-filled' : ''}`}>
            <dt>답하신 질문</dt>
            <dd>{turn}개</dd>
          </div>
          <div className="slot is-filled">
            <dt>지금 단계</dt>
            <dd>{PHASE_LABEL[phase]}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}

const PHASE_LABEL: Record<Phase, string> = {
  intro: '증상 듣는 중',
  IN_PROGRESS: '질문에 답하는 중',
  ANALYZING: '결과 정리 중',
  COMPLETED: '결과 확인',
  FAILED: '다시 상담 필요',
  EMERGENCY: '응급 안내',
  ended: '다시 상담 필요',
};

function ResultCard({ assessment, result }: { assessment: AssessmentStatus | null; result: AnalysisResult }) {
  const dept = result.recommended_department;
  const insufficient = assessment === 'INSUFFICIENT_EVIDENCE';
  return (
    <section className="result" aria-labelledby="result-title">
      <div className="result__head">
        <div className="result__title">
          <span className="result__kicker">추천 진료과</span>
          <h2 id="result-title" className="result__dept">
            {dept ?? '정하기 어려워요'}
          </h2>
          <p className="result__summary muted">{result.reason}</p>
        </div>
        {dept && (
          <Link className="btn" to={`/hospitals?${new URLSearchParams({ dept })}`}>
            <Icon name="pin" />
            지금 문 연 {dept} 찾기
          </Link>
        )}
      </div>
      <div className="result__body">
        <div>
          <h3>의심되는 질환</h3>
          {insufficient || result.suspected_diseases.length === 0 ? (
            <p className="muted">말씀해 주신 내용만으로는 의심되는 질환을 말씀드리기 어려워요.</p>
          ) : (
            <ul className="result__diseases">
              {result.suspected_diseases.map((d) => (
                <li key={d.disease_name}>
                  <strong>{d.disease_name}</strong>
                  <span className="muted">{d.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>
            <Icon name="doc" /> 참고한 자료
          </h3>
          {result.references.length === 0 ? (
            <p className="muted">참고한 자료가 없어요.</p>
          ) : (
            <ul className="result__evidence">
              {result.references.map((r) => (
                <li key={r.url}>
                  <span className="muted">{r.organization}</span>
                  <p>
                    <a href={r.url} target="_blank" rel="noopener noreferrer">
                      {r.title}
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="result__disclaimer muted">{result.medical_disclaimer}</p>
    </section>
  );
}
