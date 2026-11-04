import fs from 'node:fs'
import http from 'node:http'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const project = fileURLToPath(new URL('../', import.meta.url))

/** 生成实际分发回退菜单的浏览器夹具。参数 before 指定修复前提交，返回不调用回退 API 的 HTML。 */
function html(before) {
  const source = before
    ? execFileSync('git', ['show', '7ef076a:dsh-purge-self/client.js'], { cwd: project, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
    : fs.readFileSync(new URL('../dsh-purge-self/client.js', import.meta.url), 'utf8')
  const start = source.indexOf('var REWIND_CSS =')
  const end = source.indexOf('var RewindFallback =', start)
  if (start < 0 || end <= start) throw new Error('找不到实际回退菜单组件')
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>回退菜单布局验证</title>
<style>html,body{margin:0;height:100%;font-family:system-ui}header{padding:12px}.composer{position:fixed;bottom:12px;left:12px;right:12px;height:64px;overflow:auto;transform:translateZ(0);background:#eee;padding:8px;box-sizing:border-box}.composer>button{float:right}#status{padding:12px}</style>
<header><b>${before ? '修改前' : '修改后'}：实际回退菜单组件</b><p>输入框祖先包含 transform 与滚动区域。</p><button id="top">按钮放顶部</button> <button id="bottom">按钮放底部</button></header>
<div id="status" role="status">尚未选择</div><div class="composer"><button id="open">回退</button></div>
<script>
const refs=[];const composer=document.querySelector(".composer");let menu=null,stopWatch=null;
/** 将组件节点转换为 DOM。参数为类型、属性及子节点，返回元素。 */
function h(type,props,...children){const node=document.createElement(type);for(const [key,value] of Object.entries(props||{})){switch(key){case "ref":refs.push(()=>value(node));break;case "style":Object.assign(node.style,value);break;case "className":node.className=value;break;case "onClick":node.addEventListener("click",value);break;case "onMouseDown":node.addEventListener("mousedown",value);break;default:node.setAttribute(key,value)}}for(const child of children.flat()){if(child!=null)node.append(child instanceof Node?child:document.createTextNode(String(child)))}return node}
/** 提供菜单测试文案。参数为翻译、键及回退文案，返回回退文案。 */
function rewindText(t,key,fallback){return fallback}
const rd2={createPortal(node,target){target.append(node);return null}};
${source.slice(start, end)}
const style=document.createElement("style");style.textContent=REWIND_CSS;document.head.append(style);
/** 移除测试菜单和监听。无参数或返回值，不修改会话。 */
function closeMenu(){menu?.remove();menu=null;stopWatch?.();stopWatch=null}
document.querySelector("#open").onclick=()=>{closeMenu();const rect=document.querySelector("#open").getBoundingClientRect();const anchor=${before ? '{left:Math.max(8,rect.right-228),top:Math.max(8,rect.top-8)}' : 'rect'};const node=rewindMenuNode(null,anchor,element=>menu=element,mode=>{document.querySelector("#status").textContent="已选择 "+mode;closeMenu()});if(node)composer.append(node);for(const ref of refs.splice(0))ref();${before ? '' : 'stopWatch=watchRewindViewport(closeMenu,()=>menu);'}};
document.querySelector("#top").onclick=()=>{closeMenu();composer.style.top="8px";composer.style.bottom="auto"};
document.querySelector("#bottom").onclick=()=>{closeMenu();composer.style.top="auto";composer.style.bottom="12px"};
document.addEventListener("mousedown",event=>{if(menu&&!menu.contains(event.target)&&event.target.id!=="open")closeMenu()});
</script></html>`
}

const server = http.createServer((request, response) => {
  try {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(html(request.url === '/before'))
  } catch (error) {
    response.end(String(error.message))
  }
})
server.listen(0, '127.0.0.1', () => console.log(`DEMO_URL=http://127.0.0.1:${server.address().port}/`))
