import type { Register } from 'claude-code'

// 마을 앱이 orders.jsonl 에 한 줄씩 지시를 쌓으면, 2초마다 꺼내 해당 세션에 보낸다.
// 결과는 receipts/<id>.json 에 남겨 앱이 읽는다. 모델을 부르지 않으므로 비용이 들지 않는다.
const DIR = '__VILLAGE_DATA__'
const ORDERS = `${DIR}/orders.jsonl`
// 전달 전용 우체부 세션 (11-26): 이 파일에 적힌 세션만 배달한다. 관리소가 바빠도 배달이 줄 서지 않게 따로 둔다.
// 파일이 없으면 예전처럼 이 모드가 붙은 세션이 배달한다
const POSTMAN = `${DIR}/postman.json`
async function isPostman($: any): Promise<boolean> {
  // 정해진 우체부 세션이면 늘 배달한다. 다른 세션(관리소)은 우체부가 30초 넘게 소식이 없을 때만 대신 배달한다 (우체부가 죽어도 안 멈추게)
  try {
    if (!(await $.fs.exists(POSTMAN))) return true
    const want = String(JSON.parse(String(await $.fs.read(POSTMAN))).session ?? '')
    const me = String(await $.session.id())
    if (!want || want === me) return true
    if (!(await $.fs.exists(BEAT))) return true
    const b = JSON.parse(String(await $.fs.read(BEAT)))
    return !(b.self === want && (await $.clock.now()) - Number(b.at || 0) < 30000)
  } catch { return true }
}
const BEAT = `${DIR}/postman-beat.json`
async function beat($: any) {
  try {
    if (!(await $.fs.exists(POSTMAN))) return
    const want = String(JSON.parse(String(await $.fs.read(POSTMAN))).session ?? '')
    const me = String(await $.session.id())
    if (want === me) await $.fs.write(BEAT, JSON.stringify({ at: await $.clock.now(), self: me }))
  } catch { /* 다음 바퀴에 */ }
}

type Order = { id: string; to: string; text?: string; kind?: string; title?: string; prompt?: string; background?: string; cwd?: string; value?: string; at?: number }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    let busy = false
    const pump = async () => {
      if (busy) return
      busy = true
      try {
        if (!(await isPostman($))) return       // 다른 세션이 우체부로 정해졌다 → 나는 배달하지 않는다 (두 번 배달 막기)
        if (!(await $.fs.exists(ORDERS))) return
        const raw = await $.fs.read(ORDERS)
        const done = new Set(((await $.store.get('done')) as string[] | undefined) ?? [])
        let changed = false
        // 지시 머리말의 호칭: 마을 설정(⚙)의 「나를 부르는 말」
        let owner = '사장님'
        try { const st = JSON.parse(String(await $.fs.read(`${DIR}/settings.json`))); if (st.ownerName) owner = String(st.ownerName) } catch { /* 기본값 */ }
        for (const line of String(raw).split('\n')) {
          if (!line.trim()) continue
          let o: Order
          try { o = JSON.parse(line) } catch { continue }
          if (!o.id || done.has(o.id)) continue
          done.add(o.id)
          changed = true
          await $.store.set('done', [...done].slice(-1000))
          let receipt: Record<string, unknown>
          try {
            if (o.kind === 'model' || o.kind === 'effort') {
              // 우클릭 「모델 바꾸기」「노력도 바꾸기」: 다음 턴부터 적용. 더 비싼 쪽이면 클로드 앱이 승인을 물을 수 있다
              const r: any = o.kind === 'model'
                ? await $.tool.call({ tool: 'mcp__ccd_session_mgmt__set_session_model', session_id: o.to, model: o.value } as any)
                : await $.tool.call({ tool: 'mcp__ccd_session_mgmt__set_session_effort', session_id: o.to, effort: o.value } as any)
              const txt = String(r.text ?? '')
              if (r.deny !== undefined) receipt = { ok: false, error: `거절됨: ${r.deny}` }
              else if (r.isError || /not one of|refus|declin|denied|invalid/i.test(txt)) receipt = { ok: false, error: txt.slice(0, 500) }
              else receipt = { ok: true, detail: txt.slice(0, 300) }
            } else if (o.kind === 'spawn') {
              // 「부하 새로 만들기」: 상관과 같은 폴더에 새 세션을 띄운다. 띄운 id 는 영수증에 남기고, 화면이 상관 밑에 붙인다
              const r: any = await $.tool.call({
                tool: 'mcp__ccd_session__start_session',
                initiation: 'user_asked', context: 'fresh', use_worktree: false,
                title: String(o.title ?? '').slice(0, 58),
                prompt: String(o.prompt ?? ''), background: String(o.background ?? ''),
                ...(o.cwd ? { cwd: o.cwd } : {}),
              } as any)
              const txt = String(r.text ?? '')
              const sid = (txt.match(/local_[0-9a-f-]{36}/) || [])[0]
              if (r.deny !== undefined) receipt = { ok: false, error: `거절됨: ${r.deny}` }
              else if (r.isError || !sid) receipt = { ok: false, error: txt.slice(0, 500) || '새 세션 id 를 받지 못했습니다' }
              else receipt = { ok: true, detail: txt.slice(0, 300), newSession: sid }
            } else if (o.kind === 'archive' || o.kind === 'delete') {
              // 우클릭 「보관하기」「삭제」. 삭제는 클로드 앱이 이 세션 창에 승인 카드를 띄우고, 사장님이 승인해야 지워진다
              const r: any = o.kind === 'archive'
                ? await $.tool.call({ tool: 'mcp__ccd_session_mgmt__archive_session', session_id: o.to, reason: '에이전트빌리지에서 사장님이 보관 요청' } as any)
                : await $.tool.call({ tool: 'mcp__ccd_session_mgmt__delete_session', session_ids: [o.to], reason: '에이전트빌리지에서 사장님이 삭제 요청' } as any)
              const txt = String(r.text ?? '')
              if (r.deny !== undefined) receipt = { ok: false, error: `거절됨: ${r.deny}` }
              else if (r.isError || /skipp|not archived|declin|denied|refus|cancel/i.test(txt)) receipt = { ok: false, error: txt.slice(0, 500) }
              else receipt = { ok: true, detail: txt.slice(0, 500), ...(stopNote ? { stop: stopNote } : {}) }
            } else if (o.kind === 'rename') {
              // 우클릭 「이름 바꾸기」: 세션 제목을 바꾼다. 사장님이 직접 지은 제목이면 클로드 앱이 승인을 물을 수 있다
              const r: any = await $.tool.call({
                tool: 'mcp__ccd_session_mgmt__set_session_title',
                session_id: o.to,
                title: String(o.title ?? '').slice(0, 120),
              } as any)
              const txt = String(r.text ?? '')
              if (r.deny !== undefined) receipt = { ok: false, error: `거절됨: ${r.deny}` }
              else if (r.isError || /declin|not renamed|failed/i.test(txt)) receipt = { ok: false, error: txt.slice(0, 500) }
              else receipt = { ok: true, detail: 'renamed' }
            } else {
            // 「⚡ 지금 보내기」: 그 세션이 하던 턴을 먼저 멈춘다(사장님이 그 세션에서 멈춤을 누른 것과 같다). 그래야 줄 서지 않고 바로 읽는다
            let stopNote = ''
            if ((o as any).now) {
              try {
                const st: any = await $.tool.call({ tool: 'mcp__ccd_session_mgmt__stop_session', session_id: o.to } as any)
                stopNote = st.deny !== undefined ? `멈추기 거절: ${st.deny}` : String(st.text ?? '').slice(0, 200)
              } catch (err) { stopNote = `멈추기 실패: ${String(err).slice(0, 120)}` }
            }
            const r: any = await $.tool.call({
              tool: 'mcp__ccd_session_mgmt__send_message',
              session_id: o.to,
              // 주민끼리 보낸 말·피클 편지처럼 이미 머리말(【…】)이 붙은 글은 「사장님 지시」로 둔갑시키지 않는다
              message: String(o.text ?? '').startsWith('【') ? `${o.text}\n\n(마을 관리소 세션에 답장 메시지를 보내지 마세요)` : `【마을에서 온 ${owner} 지시】 (${owner}은(는) 마을 화면으로 결과를 봅니다. 마을 관리소 세션에 답장 메시지를 보내지 마세요)\n${o.text}`,
            } as any)
            const txt = String(r.text ?? '')
            if (r.deny !== undefined) receipt = { ok: false, error: `거절됨: ${r.deny}` }
            else if (/current session/i.test(txt)) {
              // 받는 이가 마을 관리소 자신이면 세션끼리 메시지는 못 쓴다 → 이 세션 입력창에 사람 말로 넣는다
              // 피클 편지처럼 이미 머리말(【…】)이 붙은 글은 「사장님 지시」로 둔갑시키지 않는다
              // 기다리지 않는다: 이 세션이 바쁘면 입력창 넣기가 턴이 끝날 때까지 걸려, 뒤에 선 다른 주민 지시까지 몇 분씩 묶였다 (11-26)
              void $.prompt.submit({ text: String(o.text ?? '').startsWith('【') ? String(o.text) : `【마을에서 온 ${owner} 지시】\n${o.text}`, asUser: true } as any)
              receipt = { ok: true, detail: 'delivered to self (prompt)' }
            }
            else if (r.isError || /not delivered|undelivered/i.test(txt)) receipt = { ok: false, error: txt.slice(0, 500) }
            else receipt = { ok: true, detail: txt.slice(0, 500) }
            }
          } catch (err) {
            receipt = { ok: false, error: `우체부 오류: ${String(err).slice(0, 300)}` }
          }
          await $.fs.write(`${DIR}/receipts/${o.id}.json`, JSON.stringify({ ...receipt, id: o.id, to: o.to, at: await $.clock.now() }))
          $.ui.toast(o.kind === 'rename' ? (receipt.ok ? '마을: 세션 이름 바꿈' : '마을: 이름 바꾸기 실패') : (receipt.ok ? '마을 지시 전달함' : '마을 지시 전달 실패'))
        }
        if (changed) await $.fs.write(`${DIR}/heartbeat.json`, JSON.stringify({ at: await $.clock.now(), self: await $.session.id() }))
      } catch (err) {
        $.ui.status(`마을 우체부 오류: ${String(err).slice(0, 80)}`)
      } finally {
        busy = false
      }
    }
    // 앱이 우체부가 살아 있는지 알 수 있게 심장 박동을 남긴다
    $.clock.every(2000, () => { void pump() })
    $.clock.every(5000, () => { void beat($) })
    $.clock.every(10000, () => { void (async () => { if (await isPostman($)) await $.fs.write(`${DIR}/heartbeat.json`, JSON.stringify({ at: await $.clock.now(), self: await $.session.id() })) })() })
    // 요금제 사용량(주간 한도 % 등)을 1분마다 남겨 마을 오른쪽 위에 보인다. 읽기만 하는 도구다
    const usage = async () => {
      try {
        if (!(await isPostman($))) return
        const r: any = await $.tool.call({ tool: 'mcp__ccd_session_mgmt__get_usage' } as any)
        const txt = String(r.text ?? '')
        const j = JSON.parse(txt.slice(txt.indexOf('{')))
        await $.fs.write(`${DIR}/plan-usage.json`, JSON.stringify({ at: await $.clock.now(), ...(j.plan || {}) }))
      } catch { /* 다음 바퀴에 */ }
    }
    void usage()
    $.clock.every(60000, () => { void usage() })
    void isPostman($).then(ok => $.ui.status(ok ? '마을 우체부 근무 중' : '마을 우체부 쉬는 중 (전용 우체부 세션이 배달)'))
    return started
  })
}
