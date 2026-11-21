/* 카카오(다음) 우편번호 서비스. 키 없이 쓰는 주소 검색 화면이다.
 * 주소 글자만 돌려주고 좌표는 주지 않는다. 좌표는 utils/naverMaps.ts 의 searchAddress 로 바꾼다. */

export interface PostcodeData {
  /** 도로명 주소. 도로명이 없는 곳은 빈 문자열일 수 있다 */
  roadAddress: string;
  jibunAddress: string;
  /** 사용자가 고른 형식(R 도로명, J 지번)의 주소 */
  address: string;
}

interface PostcodeOptions {
  oncomplete: (data: PostcodeData) => void;
  width?: string;
  height?: string;
}
interface PostcodeInstance {
  embed: (el: HTMLElement) => void;
}
declare global {
  interface Window {
    daum?: { Postcode: new (opts: PostcodeOptions) => PostcodeInstance };
  }
}

const SRC = 'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
let loader: Promise<void> | null = null;

export function loadPostcode(): Promise<void> {
  if (window.daum?.Postcode) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loader = null;
      reject(new Error('주소 검색 화면을 불러오지 못했습니다'));
    };
    document.head.appendChild(s);
  });
  return loader;
}

/** 주소 검색 화면을 el 안에 넣는다. 사용자가 주소를 고르면 onComplete 를 부른다 */
export async function embedPostcode(el: HTMLElement, onComplete: (data: PostcodeData) => void): Promise<void> {
  await loadPostcode();
  if (!window.daum) throw new Error('주소 검색 화면을 불러오지 못했습니다');
  new window.daum.Postcode({ oncomplete: onComplete, width: '100%', height: '100%' }).embed(el);
}
