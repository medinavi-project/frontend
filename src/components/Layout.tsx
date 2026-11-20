import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import Disclaimer from './Disclaimer';
import Icon, { type IconName } from './Icon';

const SIZE_KEY = 'medinavi:font-size';

const NAV: { to: string; label: string; short: string; icon: IconName }[] = [
  { to: '/chat', label: '증상 상담', short: '상담', icon: 'chat' },
  { to: '/hospitals', label: '문 연 병원', short: '병원', icon: 'pin' },
  { to: '/medication', label: '약봉투 읽기', short: '약봉투', icon: 'pill' },
];

function readSize(): boolean {
  try {
    return localStorage.getItem(SIZE_KEY) === 'large';
  } catch {
    return false;
  }
}

export default function Layout() {
  const [large, setLarge] = useState(readSize);
  const { pathname } = useLocation();

  useEffect(() => {
    document.documentElement.dataset.size = large ? 'large' : 'normal';
    try {
      localStorage.setItem(SIZE_KEY, large ? 'large' : 'normal');
    } catch {
      /* 저장 불가 환경은 무시 */
    }
  }, [large]);

  // 화면 이동 시 맨 위로
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        본문으로 건너뛰기
      </a>
      <header className="topbar">
        <div className="container topbar__inner">
          <Link to="/" className="brand" aria-label="메디나비 처음 화면">
            <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="9" fill="var(--rx)" />
              <path d="M13 7h6v6h6v6h-6v6h-6v-6H7v-6h6z" fill="var(--on-rx)" />
            </svg>
            메디나비
          </Link>
          <nav className="nav" aria-label="주요 메뉴">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to}>
                <Icon name={n.icon} />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="topbar__actions">
            <button
              type="button"
              className="size-toggle"
              aria-pressed={large}
              aria-label="글자 크게"
              onClick={() => setLarge((v) => !v)}
            >
              <Icon name="text" />
              <span className="size-toggle__label">글자 크게</span>
            </button>
            <a className="call-119" href="tel:119">
              <Icon name="phone" />
              응급 119
            </a>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>

      <div className="dock">
        <Disclaimer />
        <nav className="tabbar" aria-label="하단 메뉴">
          <NavLink to="/" end>
            <Icon name="home" size={24} />
            처음
          </NavLink>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to}>
              <Icon name={n.icon} size={24} />
              {n.short}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
