import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../dsh-purge-self/client.js', import.meta.url), 'utf8')
const start = source.indexOf('function rewindViewport()')
const end = source.indexOf('var RewindFallback =', start)
assert.ok(start >= 0 && end > start)
const excerpt = source.slice(start, end)

/** 创建真实分发组件的测试上下文。参数为额外依赖，返回可调用的定位和渲染函数。 */
function context(extra = {}) {
  const sandbox = {
    h(type, props, ...children) { return { type, props, children } },
    rewindText(_t, _key, fallback) { return fallback },
    rd2: null,
    ...extra,
  }
  vm.createContext(sandbox)
  vm.runInContext(excerpt, sandbox)
  return sandbox
}

test('底部按钮的回退选项向上展开且全部位于窗口内', () => {
  const result = context().rewindMenuPosition({ right: 980, top: 730, bottom: 758 }, { width: 228, height: 120 }, { width: 1000, height: 800 })
  assert.equal(result.left, 752)
  assert.equal(result.top, 602)
  assert.ok(result.top + 120 < 730)
})

test('顶部按钮空间不足时改为向下展开', () => {
  const result = context().rewindMenuPosition({ right: 60, top: 10, bottom: 38 }, { height: 120 }, { width: 800, height: 600 })
  assert.equal(result.left, 8)
  assert.equal(result.top, 46)
})

test('窄窗口和低窗口限制弹层宽高，不向页面外延伸', () => {
  const result = context().rewindMenuPosition({ right: 230, top: 50, bottom: 78 }, { width: 228, height: 240 }, { width: 180, height: 100 })
  assert.equal(result.left, 8)
  assert.equal(result.width, 164)
  assert.equal(result.top, 8)
  assert.equal(result.maxHeight, 84)
})

test('视觉窗口缩放偏移也参与边界约束', () => {
  const result = context().rewindMenuPosition({ right: 500, top: 270, bottom: 298 }, { height: 100 }, { width: 300, height: 200, left: 100, top: 150 })
  assert.ok(result.left >= 108 && result.left + result.width <= 392)
  assert.ok(result.top >= 158 && result.top + 100 <= 342)
})

test('实际菜单挂到 body 并按测量高度修正，不受输入框变换容器影响', () => {
  const body = {}
  let portal
  const sandbox = context({
    window: { innerWidth: 800, innerHeight: 600 },
    document: { body },
    rd2: { createPortal(node, target) { portal = { node, target }; return portal } },
  })
  const ref = { current: null }
  sandbox.rewindMenuNode(null, { right: 790, top: 560, bottom: 588 }, ref, () => {})
  assert.equal(portal.target, body)
  const element = { style: {}, offsetWidth: 228, scrollHeight: 180 }
  portal.node.props.ref(element)
  assert.equal(ref.current, element)
  assert.equal(element.style.top, '372px')
  assert.equal(element.style.left, '562px')
  portal.node.props.ref(null)
  assert.equal(ref.current, null)
})

test('Portal 不可用时保留兼容节点，两个回退模式和事件阻止不变', () => {
  const modes = []
  const tree = context().rewindMenuNode(null, null, null, mode => modes.push(mode))
  let prevented = 0
  let stopped = 0
  const event = { preventDefault() { prevented++ }, stopPropagation() { stopped++ } }
  for (const button of tree.children) {
    button.props.onMouseDown(event)
    button.props.onClick(event)
  }
  assert.deepEqual(modes, ['once', 'round'])
  assert.equal(prevented, 4)
  assert.equal(stopped, 4)
})

test('菜单内部滚动不关闭，窗口和外部滚动关闭，卸载移除全部监听', () => {
  const listeners = []
  let removed = 0
  let closed = 0
  const window = {
    addEventListener(name, handler, capture) { listeners.push({ name, handler, capture }) },
    removeEventListener() { removed++ },
  }
  window.visualViewport = { addEventListener: window.addEventListener, removeEventListener: window.removeEventListener }
  const inside = { nodeType: 1 }
  const cleanup = context({ window }).watchRewindViewport(() => closed++, () => ({ contains: node => node === inside }))
  assert.equal(listeners.length, 4)
  listeners.find(item => item.name === 'scroll').handler({ target: inside })
  assert.equal(closed, 0)
  listeners.find(item => item.name === 'scroll').handler({ target: { nodeType: 1 } })
  listeners.find(item => item.name === 'resize').handler({})
  assert.equal(closed, 2)
  cleanup()
  assert.equal(removed, 4)
})

test('正常组件和降级组件都传入按钮边界，菜单样式不再依赖负向变换', () => {
  const component = source.slice(source.indexOf('// src/components/rewind.js'), source.indexOf('function installRewindWatch'))
  assert.ok(component.includes('menuPos: rect'))
  assert.ok(component.includes('setMenuPos(rect)'))
  assert.ok(component.includes('this.stopViewport?.()'))
  assert.ok(component.includes('overflow-y:auto'))
  assert.ok(!component.includes('translateY(-100%)'))
})
