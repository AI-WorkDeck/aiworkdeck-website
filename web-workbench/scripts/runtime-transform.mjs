// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

export function mapRuntimeTransport(code, transportModule) {
  const replace = (before, after) => {
    if (code.split(before).length !== 2) throw Error('Expected pinned runtime boot block: ' + before);
    code = code.replace(before, after);
  };
  replace('    let dispose = () => {}',
    '    let runtimeTransport\n    let dispose = () => { disposed = true; runtimeTransport?.dispose() }');
  replace('    const injections = []',
    '    runtimeTransport = startRuntimeTransport({ baseUrl: sofficeBaseUrl, onFatal: reportFatal })\n    const injections = []');
  replace('    const Module = {',
    '    await runtimeTransport.ready\n    if (disposed) return\n    const Module = {\n      ...runtimeTransport.hooks,');
  replace('dispose = () => { if (disposed) return; disposed = true; resizeObserver.disconnect() }',
    'dispose = () => { if (disposed) return; disposed = true; runtimeTransport.dispose(); resizeObserver.disconnect() }');
  return `import {startRuntimeTransport} from ${JSON.stringify(transportModule)};\n` + code;
}
