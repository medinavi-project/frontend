import Icon from './Icon';

/** 모든 화면 하단에 고정되는 안내 (기술문서 2-5) */
export default function Disclaimer() {
  return (
    <aside className="disclaimer" aria-label="이용 안내">
      <div className="container">
        <span>
          <strong>의학적 진단이 아닌 진료 안내입니다.</strong>
        </span>
        <a className="disclaimer__call" href="tel:119">
          <Icon name="phone" />
          응급 상황이면 119
        </a>
      </div>
    </aside>
  );
}
