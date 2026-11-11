// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
export function progressView(state, en = false) {
  const t = (zh, english) => en ? english : zh;
  if (['error', 'disposed'].includes(state.status)) return {hidden: true, percent: null, label: ''};
  if (state.status === 'ready') return {hidden: false, percent: null, label: t('正在打开文档', 'Opening your document')};
  const p = state.progress;
  if (p?.completed === 6 || !p && ['starting', 'opening'].includes(state.phase)) return {hidden: false, percent: null, label: t('正在启动编辑器', 'Starting the editor')};
  if (p?.reliable && p.loaded < p.total) {
    const percent = Math.floor(p.loaded / p.total * 100);
    return {hidden: false, percent, label: t(`主要资源加载 ${percent}%`, `Loading main resources ${percent}%`)};
  }
  return {hidden: false, percent: null, label: p?.loaded === p?.total && p ? t('正在完成资源加载', 'Finishing resource loading') : t('正在加载主要资源', 'Loading main resources')};
}
