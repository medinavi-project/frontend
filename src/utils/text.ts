/**
 * 서버 문구에 섞여 온 HTML 태그(예: e약은요 원문의 <p>, <br>)를 걷어 내고 일반 글자로 바꾼다.
 * 문구 내용은 바꾸지 않는다. 문단·줄바꿈 태그는 줄바꿈으로 남긴다.
 * DOMParser 결과는 화면에 붙이지 않고 글자만 꺼내므로 스크립트가 실행되지 않는다.
 */
export function plainText(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!/[<&]/.test(value)) return value.trim() || null;
  const withBreaks = value.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p\s*>/gi, '\n');
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  const text = (doc.body.textContent ?? '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return text || null;
}
