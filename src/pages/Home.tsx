import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon, { type IconName } from '../components/Icon';

const EXAMPLES = ['배가 아파요', '머리가 지끈거려요', '열이 나고 기침해요', '허리가 쑤셔요'];

const SOURCES = ['질병관리청 국가건강정보포털', '국립중앙의료원 전국 병·의원 정보', '식품의약품안전처 e약은요'];

const SERVICES: { to: string; icon: IconName; tone: 'rx' | 'open'; title: string; desc: string; action: string }[] = [
  {
    to: '/chat',
    icon: 'chat',
    tone: 'rx',
    title: '증상 상담',
    desc: '부위, 시작된 때, 아픈 정도를 하나씩 여쭤보고 맞는 진료과를 알려 드려요.',
    action: '상담 시작하기',
  },
  {
    to: '/hospitals',
    icon: 'pin',
    tone: 'open',
    title: '지금 문 연 병원',
    desc: '지금 요일과 시각에 진료 중인 근처 병원만 지도에 보여 드려요.',
    action: '병원 찾기',
  },
  {
    to: '/medication',
    icon: 'pill',
    tone: 'rx',
    title: '약봉투 읽어 주기',
    desc: '약봉투 사진을 찍으면 약 이름을 찾아 쉬운 말과 음성으로 알려 드려요.',
    action: '사진 올리기',
  },
];

const STEPS = [
  { title: '증상을 나눠 여쭤봐요', desc: '부위, 시작된 때, 아픈 정도, 같이 나타나는 증상을 한 번에 하나씩 물어요.' },
  { title: '공식 건강정보에서 찾아요', desc: '질병관리청 문서 안에서만 의심 질환과 진료과를 골라요.' },
  { title: '문 연 병원을 보여 드려요', desc: '지금 진료 중인 병원만 지도에 표시하고 전화로 바로 연결해요.' },
];

const delay = (d: number) => ({ '--d': d }) as CSSProperties;

export default function Home() {
  const [text, setText] = useState('');
  const navigate = useNavigate();

  const start = (value: string) => {
    const v = value.trim();
    if (!v) return;
    navigate('/chat', { state: { initial: v } });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    start(text);
  };

  return (
    <div className="home">
      <section className="container hero" aria-labelledby="ask-title">
        <div className="hero__ask">
          <h1 id="ask-title" className="enter">
            어디가
            <br />
            불편하세요?
          </h1>
          <p className="hero__lead enter" style={delay(1)}>
            평소 말하듯 적어 주세요. 몇 가지를 더 여쭤본 뒤 맞는 진료과와 지금 문 연 병원을 알려 드려요.
          </p>
          <form className="ask enter" style={delay(2)} onSubmit={onSubmit}>
            <label htmlFor="ask-input" className="ask__label">
              증상
            </label>
            <div className="ask__row">
              <textarea
                id="ask-input"
                rows={2}
                placeholder="예: 어제부터 오른쪽 아랫배가 아파요"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    start(text);
                  }
                }}
              />
              <button className="btn" type="submit" disabled={!text.trim()}>
                상담 시작하기
              </button>
            </div>
          </form>
          <div className="hero__chips enter" style={delay(3)}>
            <span className="muted" id="examples-label">
              자주 찾는 증상
            </span>
            <ul className="chips" aria-labelledby="examples-label">
              {EXAMPLES.map((ex) => (
                <li key={ex}>
                  <button type="button" className="chip" onClick={() => start(ex)}>
                    {ex}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <ConversationPreview />
      </section>

      <section className="sources" aria-label="데이터 출처">
        <div className="container sources__inner">
          <strong>공식 자료 안에서만 답해요</strong>
          {SOURCES.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </section>

      <section className="container services" aria-labelledby="services-title">
        <h2 id="services-title">필요한 도움을 고르세요</h2>
        <div className="services__grid">
          {SERVICES.map((s) => (
            <Link key={s.to} to={s.to} className="service">
              <span className={`service__icon service__icon--${s.tone}`}>
                <Icon name={s.icon} size={28} />
              </span>
              <strong className="service__title">{s.title}</strong>
              <span className="muted">{s.desc}</span>
              <span className="service__action">{s.action}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="container how" aria-labelledby="how-title">
        <h2 id="how-title">상담은 세 단계로 진행돼요</h2>
        <ol>
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="how__step">{i + 1}단계</span>
              <strong>{s.title}</strong>
              <span className="muted">{s.desc}</span>
            </li>
          ))}
        </ol>
        <div className="how__note">
          <Icon name="alert" size={26} />
          <div>
            <strong>위험 신호가 있으면 바로 응급 안내로 넘어가요</strong>
            <span>가슴 통증, 숨쉬기 어려움, 의식 저하가 있으면 질문을 멈추고 119와 가까운 응급실을 먼저 알려 드려요.</span>
          </div>
        </div>
      </section>
    </div>
  );
}

/** 상담이 실제로 어떻게 진행되는지 보여 주는 예시 (데스크톱 전용) */
function ConversationPreview() {
  return (
    <figure className="preview" aria-label="상담 예시">
      <span className="bubble bubble--user">배가 아파요</span>
      <span className="bubble bubble--bot">아픈 곳이 정확히 어디인가요?</span>
      <span className="bubble bubble--user">오른쪽 아래요</span>
      <span className="bubble bubble--bot">0부터 10 중 몇 점 정도로 아프세요?</span>
      <span className="preview__scale" aria-hidden="true">
        {[5, 6, 7, 8, 9].map((n) => (
          <span key={n} className={n === 7 ? 'is-on' : undefined}>
            {n}
          </span>
        ))}
      </span>
      <div className="preview__result">
        <div>
          <span className="muted">추천 진료과</span>
          <strong>외과</strong>
        </div>
        <span className="badge badge--open">근처 3곳 진료 중</span>
      </div>
    </figure>
  );
}
