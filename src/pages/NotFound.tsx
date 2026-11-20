import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="container">
      <h1>없는 페이지예요</h1>
      <p className="muted">주소를 다시 확인하거나 처음 화면에서 시작해 주세요.</p>
      <Link className="btn" to="/">
        처음 화면으로
      </Link>
    </div>
  );
}
