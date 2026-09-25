import { useEffect } from 'react';

// 코드블록 호버 시 Copy/Format 플로팅 버튼.
// Format은 명시적 클릭 시에만 실행 — 커서 이탈 시 자동 재인덴트는 문자열/주석 안의
// 중괄호를 오판해 사용자가 의도한 들여쓰기를 훼손할 수 있어 제거함.
// 코드블록 호버 시 Copy 플로팅 버튼
// 케밥을 누르면 setCodeMenu로 메뉴 위치와 블록 ID를 알린다.
export function useCodeBlockButtons(setCodeMenu: (menu: { blockId: string; x: number; y: number } | null) => void) {
  useEffect(() => {
    let hoverTarget: HTMLElement | null = null;
    let timeoutId: any = null;

    // 고정 SVG 문자열 — 이모지 대신 라인 아이콘으로 (사용자 입력 미포함이라 innerHTML 안전)
    const COPY_LABEL = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span>Copy</span>';
    const COPIED_LABEL = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span>Copied</span>';

    const makeFloatingBtn = (className: string, html: string) => {
      const btn = document.createElement('button');
      btn.className = className;
      btn.innerHTML = html;
      btn.style.position = 'absolute';
      btn.style.cursor = 'pointer';
      btn.style.opacity = '0';
      btn.style.pointerEvents = 'none';
      btn.style.transition = 'opacity 0.2s';
      btn.style.zIndex = '1000';
      // 오른쪽 끝 기준 정렬 — 라벨 길이가 달라져도 위치가 흔들리지 않음
      btn.style.transform = 'translateX(-100%)';
      document.body.appendChild(btn);
      return btn;
    };

    const copyBtn = makeFloatingBtn('bn-floating-copy-btn', COPY_LABEL);
    // 케밥(⋮) — 복사/잘라내기/삭제/언어 메뉴 트리거
    const KEBAB_LABEL = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
    const menuBtn = makeFloatingBtn('bn-floating-copy-btn bn-floating-menu-btn', KEBAB_LABEL);

    const buttons = [copyBtn, menuBtn];

    const resetCopyBtn = () => {
      copyBtn.innerHTML = COPY_LABEL;
      copyBtn.classList.remove('copied');
    };

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const codeBlock = target.closest('.bn-block-content[data-content-type="codeBlock"]') as HTMLElement;

      if (codeBlock) {
        hoverTarget = codeBlock;
        const rect = codeBlock.getBoundingClientRect();
        menuBtn.style.top = `${rect.top + window.scrollY + 8}px`;
        menuBtn.style.left = `${rect.right + window.scrollX - 10}px`;
        copyBtn.style.top = `${rect.top + window.scrollY + 8}px`;
        copyBtn.style.left = `${rect.right + window.scrollX - 42}px`;
        for (const b of buttons) {
          b.style.opacity = '1';
          b.style.pointerEvents = 'auto';
        }
        clearTimeout(timeoutId);
      } else {
        if (!buttons.some(b => b === target || b.contains(target))) {
          timeoutId = setTimeout(() => {
            for (const b of buttons) {
              b.style.opacity = '0';
              b.style.pointerEvents = 'none';
            }
            hoverTarget = null;
            resetCopyBtn();
          }, 100);
        }
      }
    };

    copyBtn.onclick = () => {
      if (hoverTarget) {
        const pre = hoverTarget.querySelector('pre');
        if (pre) {
          navigator.clipboard.writeText(pre.innerText);
          copyBtn.innerHTML = COPIED_LABEL;
          copyBtn.classList.add('copied');
          setTimeout(resetCopyBtn, 1800);
        }
      }
    };

    menuBtn.onclick = () => {
      if (!hoverTarget) return;
      const id = (hoverTarget.closest('[data-id]') as HTMLElement | null)?.getAttribute('data-id');
      if (!id) return;
      const r = menuBtn.getBoundingClientRect();
      setCodeMenu({ blockId: id, x: r.right, y: r.bottom + 6 });
    };

    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      for (const b of buttons) {
        if (document.body.contains(b)) {
          document.body.removeChild(b);
        }
      }
    };
  }, [setCodeMenu]);
}
