import { useEffect, useRef, useState } from 'react';
import { embedPostcode } from '../utils/postcode';
import Icon from './Icon';

interface Props {
  /** 사용자가 고른 주소 글자(도로명 우선) */
  onPick: (address: string) => void;
  onClose: () => void;
}

/** 동네·도로·건물 이름을 치면 목록이 나오고 하나를 고르는 주소 검색 */
export default function AddressPicker({ onPick, onClose }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let cancelled = false;
    embedPostcode(el, (d) => pickRef.current(d.roadAddress || d.address)).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
      el.replaceChildren(); // 화면을 닫거나 다시 열 때 이전 검색 화면이 남지 않게
    };
  }, []);

  return (
    <section className="addrpick" aria-label="주소 검색">
      <div className="addrpick__head">
        <strong>동네나 도로 이름으로 찾기</strong>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
          닫기
        </button>
      </div>
      {failed ? (
        <div className="error" role="alert">
          <Icon name="alert" />
          <span>주소 검색 화면을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.</span>
        </div>
      ) : (
        <div ref={box} className="addrpick__box" />
      )}
    </section>
  );
}
