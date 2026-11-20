import { Link } from 'react-router-dom';
import Icon from './Icon';

interface Props {
  message?: string;
}

/** 위험 신호 감지 시 문진을 멈추고 띄우는 응급 안내 (기술문서 2-2) */
export default function EmergencyBanner({ message }: Props) {
  return (
    <section className="emergency" role="alert" aria-live="assertive">
      <Icon name="alert" size={32} className="emergency__icon" />
      <h2>지금 바로 응급 진료가 필요할 수 있어요</h2>
      <p>
        {message ??
          '가슴 통증, 숨쉬기 어려움, 의식이 흐려지는 증상은 기다리지 말고 바로 도움을 받으세요.'}
      </p>
      <div className="emergency__actions">
        <a className="btn btn--alert" href="tel:119">
          <Icon name="phone" />
          119에 전화하기
        </a>
        <Link className="btn btn--ghost" to="/hospitals?dept=응급의학과">
          <Icon name="pin" />
          가까운 응급실 보기
        </Link>
      </div>
    </section>
  );
}
