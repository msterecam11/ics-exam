"use client"

import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import UnderlineExt from "@tiptap/extension-underline"
import { Color } from "@tiptap/extension-color"
import { TextStyle } from "@tiptap/extension-text-style"
import Highlight from "@tiptap/extension-highlight"
import FontFamily from "@tiptap/extension-font-family"
import TextAlign from "@tiptap/extension-text-align"
import { Table } from "@tiptap/extension-table"
import TableRow from "@tiptap/extension-table-row"
import TableCell from "@tiptap/extension-table-cell"
import TableHeader from "@tiptap/extension-table-header"
import ImageExt from "@tiptap/extension-image"
import { Extension } from "@tiptap/core"
import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Minus, Table2, Image as ImageIcon, ChevronDown,
  Highlighter, Baseline, Undo, Redo, PaintBucket, Upload, Link2,
} from "lucide-react"
import LibraryPicker, { LibraryFile } from "@/components/lms/LibraryPicker"

// ─── FontSize extension ───────────────────────────────────────────
const FontSize = Extension.create({
  name: "fontSize",
  addOptions() { return { types: ["textStyle"] } },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.fontSize || null,
          renderHTML: (attrs: any) => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
        },
      },
    }]
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }: any) => chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }: any) => chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    } as any
  },
})

// ─── Constants ───────────────────────────────────────────────────
const FONTS = [
  { label: "Plus Jakarta Sans", value: "'Plus Jakarta Sans', sans-serif" },
  { label: "Inter",             value: "'Inter', sans-serif" },
  { label: "Georgia",           value: "Georgia, serif" },
  { label: "Courier New",       value: "'Courier New', monospace" },
  { label: "Arial",             value: "Arial, sans-serif" },
]
const SIZES = ["10px","12px","14px","16px","18px","20px","24px","28px","32px","36px","48px"]
const TEXT_COLORS = ["#000000","#1B4F8A","#1e40af","#374151","#6B7280","#9ca3af","#ef4444","#f97316","#eab308","#22c55e","#8b5cf6","#ec4899","#ffffff"]
const HIGHLIGHT_COLORS = ["#fef08a","#bbf7d0","#bae6fd","#fde68a","#fecaca","#e9d5ff","#fbcfe8","#f1f5f9"]
const BOX_BG_COLORS = [
  { label: "White",       value: "#ffffff" },
  { label: "Light Grey",  value: "#f8fafc" },
  { label: "Light Blue",  value: "#eff6ff" },
  { label: "Light Green", value: "#f0fdf4" },
  { label: "Light Yellow",value: "#fefce8" },
  { label: "Light Rose",  value: "#fff1f2" },
  { label: "Cream",       value: "#faf7f2" },
  { label: "Navy",        value: "#1B4F8A" },
  { label: "Dark Slate",  value: "#1e293b" },
  { label: "Black",       value: "#000000" },
]
const HEADING_OPTIONS = [
  { label: "Paragraph", value: 0 },
  { label: "Heading 1", value: 1 },
  { label: "Heading 2", value: 2 },
  { label: "Heading 3", value: 3 },
  { label: "Heading 4", value: 4 },
]

// ─── Small UI helpers ─────────────────────────────────────────────
function ToolBtn({ onClick, active=false, disabled=false, title, children }: {
  onClick:()=>void; active?:boolean; disabled?:boolean; title?:string; children:React.ReactNode
}) {
  return (
    <button type="button" onMouseDown={e=>{e.preventDefault();if(!disabled)onClick()}} disabled={disabled} title={title}
      className={cn("w-7 h-7 flex items-center justify-center rounded transition-colors",
        active?"bg-[#1B4F8A] text-white":"text-slate-600 hover:bg-slate-100",
        disabled&&"opacity-30 cursor-not-allowed pointer-events-none")}>
      {children}
    </button>
  )
}
function Sep() { return <div className="w-px h-5 bg-slate-200 mx-0.5 shrink-0" /> }

function Dropdown({ label, children, width="w-40" }: { label:React.ReactNode; children:React.ReactNode; width?:string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative shrink-0">
      <button type="button" onMouseDown={e=>{e.preventDefault();setOpen(o=>!o)}}
        className="flex items-center gap-1 px-2 h-7 text-xs text-slate-600 hover:bg-slate-100 rounded border border-slate-200 transition-colors">
        {label}<ChevronDown className="h-3 w-3 text-slate-400 shrink-0" />
      </button>
      {open&&<><div className="fixed inset-0 z-40" onClick={()=>setOpen(false)}/>
        <div className={cn("absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 max-h-56 overflow-y-auto",width)}>
          <div onClick={()=>setOpen(false)}>{children}</div>
        </div></>}
    </div>
  )
}
function DropItem({ onClick, active=false, children }: { onClick:()=>void; active?:boolean; children:React.ReactNode }) {
  return (
    <button type="button" onMouseDown={e=>{e.preventDefault();onClick()}}
      className={cn("w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors",active&&"bg-[#1B4F8A]/10 text-[#1B4F8A] font-semibold")}>
      {children}
    </button>
  )
}

// ─── Table dialog ─────────────────────────────────────────────────
function TableDialog({ onInsert, onClose }: { onInsert:(r:number,c:number)=>void; onClose:()=>void }) {
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose}/>
      <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-4 w-56"
        onMouseDown={e=>e.stopPropagation()}>
        <p className="text-xs font-semibold text-slate-700 mb-3">Insert Table</p>
        <div className="space-y-2 mb-3">
          <label className="flex items-center justify-between text-xs text-slate-500">
            Rows
            <input type="number" min={1} max={20} value={rows} onChange={e=>setRows(Math.max(1,+e.target.value))}
              className="w-16 text-xs border border-slate-200 rounded px-2 py-1 text-center outline-none focus:ring-1 focus:ring-[#1B4F8A]"/>
          </label>
          <label className="flex items-center justify-between text-xs text-slate-500">
            Columns
            <input type="number" min={1} max={10} value={cols} onChange={e=>setCols(Math.max(1,+e.target.value))}
              className="w-16 text-xs border border-slate-200 rounded px-2 py-1 text-center outline-none focus:ring-1 focus:ring-[#1B4F8A]"/>
          </label>
        </div>
        <button type="button"
          onMouseDown={e=>{e.preventDefault();onInsert(rows,cols);onClose()}}
          className="w-full bg-[#1B4F8A] text-white text-xs rounded-lg py-1.5 hover:bg-[#163f6e] transition-colors">
          Insert
        </button>
      </div>
    </>
  )
}

// ─── Image dialog ─────────────────────────────────────────────────
function ImageDialog({ onInsert, onClose }: { onInsert:(src:string)=>void; onClose:()=>void }) {
  const [tab, setTab] = useState<"url"|"library">("url")
  const [url, setUrl] = useState("")
  const [showLibrary, setShowLibrary] = useState(false)

  function handleUrl() {
    if (!url.trim()) return
    onInsert(url.trim())
    onClose()
  }

  if (showLibrary) {
    return (
      <LibraryPicker
        open
        onClose={() => setShowLibrary(false)}
        onSelect={(file: LibraryFile) => {
          onInsert(file.public_url)
          onClose()
        }}
        allowedTypes={["image"]}
        title="Select Image"
      />
    )
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose}/>
      <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-4 w-80"
        onMouseDown={e=>e.stopPropagation()}>
        <p className="text-xs font-semibold text-slate-700 mb-3">Insert Image</p>
        {/* Tabs */}
        <div className="flex gap-1 mb-3 bg-slate-100 rounded-lg p-0.5">
          {(["url","library"] as const).map(t=>(
            <button key={t} type="button"
              onMouseDown={e=>{e.preventDefault();setTab(t)}}
              className={cn("flex-1 text-xs py-1 rounded-md font-medium transition-colors",
                tab===t?"bg-white text-slate-800 shadow-sm":"text-slate-500 hover:text-slate-700")}>
              {t==="url"?"From URL":"From Library"}
            </button>
          ))}
        </div>
        {tab==="url"?(
          <div className="space-y-2">
            <input autoFocus value={url} onChange={e=>setUrl(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleUrl()}
              placeholder="https://example.com/image.jpg"
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:ring-1 focus:ring-[#1B4F8A]"/>
            <button type="button" onMouseDown={e=>{e.preventDefault();handleUrl()}}
              className="w-full bg-[#1B4F8A] text-white text-xs rounded-lg py-1.5 hover:bg-[#163f6e] transition-colors flex items-center justify-center gap-1.5">
              <Link2 className="h-3 w-3"/> Insert from URL
            </button>
          </div>
        ):(
          <button type="button"
            onMouseDown={e=>{e.preventDefault();setShowLibrary(true)}}
            className="w-full bg-[#1B4F8A] text-white text-xs rounded-lg py-1.5 hover:bg-[#163f6e] transition-colors flex items-center justify-center gap-1.5">
            <Upload className="h-3 w-3"/> Open Library
          </button>
        )}
      </div>
    </>
  )
}

// ─── Toolbar ──────────────────────────────────────────────────────
function Toolbar({ editor, bgColor, onBgColorChange }: {
  editor: Editor
  bgColor: string
  onBgColorChange: (c: string) => void
}) {
  const [picker, setPicker]     = useState<"text"|"hl"|"bg"|null>(null)
  const [showTable, setShowTable] = useState(false)
  const [showImg, setShowImg]   = useState(false)
  const tableRef = useRef<HTMLDivElement>(null)
  const imgRef   = useRef<HTMLDivElement>(null)

  const curH    = HEADING_OPTIONS.find(h=>h.value===0?editor.isActive("paragraph"):editor.isActive("heading",{level:h.value}))??HEADING_OPTIONS[0]
  const curFont = FONTS.find(f=>editor.isActive("textStyle",{fontFamily:f.value}))??FONTS[0]
  const curSize = (editor.getAttributes("textStyle").fontSize??"16px").replace("px","")
  const curColor= editor.getAttributes("textStyle").color??"#000000"
  const curHL   = editor.getAttributes("highlight").color??"#fef08a"

  return (
    <div className="border-b border-slate-200 bg-slate-50 px-2 py-1.5 flex flex-wrap items-center gap-0.5 shrink-0">

      {/* Heading */}
      <Dropdown label={<span className="truncate max-w-[88px] font-medium">{curH.label}</span>} width="w-36">
        {HEADING_OPTIONS.map(h=>(
          <DropItem key={h.value} active={curH.value===h.value}
            onClick={()=>h.value===0?editor.chain().focus().setParagraph().run():editor.chain().focus().setHeading({level:h.value as 1|2|3|4}).run()}>
            <span style={{fontSize:h.value===0?"13px":`${Math.max(13,22-h.value*2)}px`,fontWeight:h.value>0?700:400}}>{h.label}</span>
          </DropItem>
        ))}
      </Dropdown>

      {/* Font family */}
      <Dropdown label={<span className="truncate max-w-[100px]">{curFont.label}</span>} width="w-48">
        {FONTS.map(f=>(
          <DropItem key={f.value} active={curFont.value===f.value} onClick={()=>editor.chain().focus().setFontFamily(f.value).run()}>
            <span style={{fontFamily:f.value}}>{f.label}</span>
          </DropItem>
        ))}
      </Dropdown>

      {/* Font size */}
      <Dropdown label={<span className="w-6 text-center font-medium">{curSize}</span>} width="w-20">
        {SIZES.map(s=>(
          <DropItem key={s} active={editor.getAttributes("textStyle").fontSize===s}
            onClick={()=>(editor.chain().focus() as any).setFontSize(s).run()}>
            {s.replace("px","")}
          </DropItem>
        ))}
      </Dropdown>

      <Sep/>

      {/* Bold / Italic / Underline */}
      <ToolBtn onClick={()=>editor.chain().focus().toggleBold().run()}      active={editor.isActive("bold")}      title="Bold">      <Bold      className="h-3.5 w-3.5"/></ToolBtn>
      <ToolBtn onClick={()=>editor.chain().focus().toggleItalic().run()}    active={editor.isActive("italic")}    title="Italic">    <Italic    className="h-3.5 w-3.5"/></ToolBtn>
      <ToolBtn onClick={()=>editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline"> <Underline className="h-3.5 w-3.5"/></ToolBtn>

      <Sep/>

      {/* Text color */}
      <div className="relative">
        <button type="button" title="Text color" onMouseDown={e=>{e.preventDefault();setPicker(c=>c==="text"?null:"text")}}
          className="w-7 h-7 flex flex-col items-center justify-center gap-0.5 rounded hover:bg-slate-100 transition-colors">
          <Baseline className="h-3.5 w-3.5 text-slate-600"/>
          <div className="h-1 w-4 rounded-sm" style={{backgroundColor:curColor}}/>
        </button>
        {picker==="text"&&<><div className="fixed inset-0 z-40" onClick={()=>setPicker(null)}/>
          <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-2.5">
            <p className="text-[10px] text-slate-400 mb-1.5 font-medium">TEXT COLOR</p>
            <div className="grid grid-cols-7 gap-1 mb-1.5">
              {TEXT_COLORS.map(c=>(
                <button key={c} type="button" onMouseDown={e=>{e.preventDefault();editor.chain().focus().setColor(c).run();setPicker(null)}}
                  className={cn("w-5 h-5 rounded border hover:scale-110 transition-transform",c==="#ffffff"?"border-slate-300":"border-transparent")} style={{backgroundColor:c}}/>
              ))}
            </div>
            <button type="button" onMouseDown={e=>{e.preventDefault();editor.chain().focus().unsetColor().run();setPicker(null)}}
              className="w-full text-[10px] text-slate-400 hover:text-slate-600 text-center">Remove</button>
          </div></>}
      </div>

      {/* Text highlight */}
      <div className="relative">
        <button type="button" title="Highlight" onMouseDown={e=>{e.preventDefault();setPicker(c=>c==="hl"?null:"hl")}}
          className="w-7 h-7 flex flex-col items-center justify-center gap-0.5 rounded hover:bg-slate-100 transition-colors">
          <Highlighter className="h-3.5 w-3.5 text-slate-600"/>
          <div className="h-1 w-4 rounded-sm border border-slate-200" style={{backgroundColor:curHL}}/>
        </button>
        {picker==="hl"&&<><div className="fixed inset-0 z-40" onClick={()=>setPicker(null)}/>
          <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-2.5">
            <p className="text-[10px] text-slate-400 mb-1.5 font-medium">HIGHLIGHT</p>
            <div className="grid grid-cols-4 gap-1 mb-1.5">
              {HIGHLIGHT_COLORS.map(c=>(
                <button key={c} type="button" onMouseDown={e=>{e.preventDefault();editor.chain().focus().toggleHighlight({color:c}).run();setPicker(null)}}
                  className="w-6 h-6 rounded border border-slate-200 hover:scale-110 transition-transform" style={{backgroundColor:c}}/>
              ))}
            </div>
            <button type="button" onMouseDown={e=>{e.preventDefault();editor.chain().focus().unsetHighlight().run();setPicker(null)}}
              className="w-full text-[10px] text-slate-400 hover:text-slate-600 text-center">Remove</button>
          </div></>}
      </div>

      {/* Box background color */}
      <div className="relative">
        <button type="button" title="Page background color" onMouseDown={e=>{e.preventDefault();setPicker(c=>c==="bg"?null:"bg")}}
          className="w-7 h-7 flex flex-col items-center justify-center gap-0.5 rounded hover:bg-slate-100 transition-colors">
          <PaintBucket className="h-3.5 w-3.5 text-slate-600"/>
          <div className="h-1 w-4 rounded-sm border border-slate-200" style={{backgroundColor:bgColor}}/>
        </button>
        {picker==="bg"&&<><div className="fixed inset-0 z-40" onClick={()=>setPicker(null)}/>
          <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-2.5 w-44">
            <p className="text-[10px] text-slate-400 mb-2 font-medium">PAGE BACKGROUND</p>
            <div className="grid grid-cols-5 gap-1.5">
              {BOX_BG_COLORS.map(({label,value})=>(
                <button key={value} type="button" title={label}
                  onMouseDown={e=>{e.preventDefault();onBgColorChange(value);setPicker(null)}}
                  className={cn("w-7 h-7 rounded-lg border hover:scale-110 transition-transform",
                    bgColor===value?"ring-2 ring-[#1B4F8A] ring-offset-1":"border-slate-200")}
                  style={{backgroundColor:value}}/>
              ))}
            </div>
          </div></>}
      </div>

      <Sep/>

      {/* Alignment */}
      <ToolBtn onClick={()=>editor.chain().focus().setTextAlign("left").run()}    active={editor.isActive({textAlign:"left"})}    title="Left">    <AlignLeft    className="h-3.5 w-3.5"/></ToolBtn>
      <ToolBtn onClick={()=>editor.chain().focus().setTextAlign("center").run()}  active={editor.isActive({textAlign:"center"})}  title="Center">  <AlignCenter  className="h-3.5 w-3.5"/></ToolBtn>
      <ToolBtn onClick={()=>editor.chain().focus().setTextAlign("right").run()}   active={editor.isActive({textAlign:"right"})}   title="Right">   <AlignRight   className="h-3.5 w-3.5"/></ToolBtn>
      <ToolBtn onClick={()=>editor.chain().focus().setTextAlign("justify").run()} active={editor.isActive({textAlign:"justify"})} title="Justify"> <AlignJustify className="h-3.5 w-3.5"/></ToolBtn>

      <Sep/>

      {/* Lists */}
      <ToolBtn onClick={()=>editor.chain().focus().toggleBulletList().run()}  active={editor.isActive("bulletList")}  title="Bullet list">   <List        className="h-3.5 w-3.5"/></ToolBtn>
      <ToolBtn onClick={()=>editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list"> <ListOrdered className="h-3.5 w-3.5"/></ToolBtn>

      <Sep/>

      {/* Table — dialog for rows/cols */}
      <div className="relative" ref={tableRef}>
        <ToolBtn onClick={()=>setShowTable(v=>!v)} active={showTable} title="Insert table">
          <Table2 className="h-3.5 w-3.5"/>
        </ToolBtn>
        {showTable&&(
          <TableDialog
            onInsert={(r,c)=>editor.chain().focus().insertTable({rows:r,cols:c,withHeaderRow:true}).run()}
            onClose={()=>setShowTable(false)}
          />
        )}
      </div>

      {/* Image — URL or library */}
      <div className="relative" ref={imgRef}>
        <ToolBtn onClick={()=>setShowImg(v=>!v)} active={showImg} title="Insert image">
          <ImageIcon className="h-3.5 w-3.5"/>
        </ToolBtn>
        {showImg&&(
          <ImageDialog
            onInsert={src=>editor.chain().focus().setImage({src}).run()}
            onClose={()=>setShowImg(false)}
          />
        )}
      </div>

      <ToolBtn onClick={()=>editor.chain().focus().setHorizontalRule().run()} title="Horizontal line"><Minus className="h-3.5 w-3.5"/></ToolBtn>

      <Sep/>

      {/* Undo / Redo */}
      <ToolBtn onClick={()=>editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo"><Undo className="h-3.5 w-3.5"/></ToolBtn>
      <ToolBtn onClick={()=>editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo"><Redo className="h-3.5 w-3.5"/></ToolBtn>
    </div>
  )
}

// ─── Extensions ───────────────────────────────────────────────────
function buildExtensions() {
  return [
    StarterKit.configure({ heading: { levels: [1,2,3,4] } }),
    UnderlineExt, TextStyle, Color, FontSize, FontFamily,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading","paragraph"] }),
    Table.configure({ resizable: false }), TableRow, TableCell, TableHeader,
    ImageExt.configure({ inline: false, allowBase64: true }),
  ]
}

// ─── RichTextEditor (edit mode) ───────────────────────────────────
interface RichTextEditorProps {
  value?: string
  content?: string
  bgColor?: string
  onChange: (html: string) => void
  onBgColorChange?: (color: string) => void
  placeholder?: string
  minHeight?: number
}

export function RichTextEditor({
  value, content, bgColor = "#ffffff", onChange, onBgColorChange,
  placeholder: _placeholder, minHeight,
}: RichTextEditorProps) {
  const html = value ?? content ?? ""
  const editor = useEditor({
    extensions: buildExtensions(),
    content: html || "<p></p>",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })
  useEffect(() => {
    if (!editor) return
    if (editor.getHTML() !== html) editor.commands.setContent(html || "<p></p>")
  }, [html]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) return null
  return (
    <div className="flex flex-col h-full" style={minHeight ? { minHeight } : undefined}>
      <Toolbar
        editor={editor}
        bgColor={bgColor}
        onBgColorChange={onBgColorChange ?? (()=>{})}
      />
      <div className="flex-1 overflow-y-auto" style={{ backgroundColor: bgColor }}>
        <EditorContent editor={editor} className="rich-editor h-full" />
      </div>
    </div>
  )
}

// ─── RichTextViewer (read-only) ───────────────────────────────────
export function RichTextViewer({ html, bgColor = "#ffffff" }: { html: string; bgColor?: string }) {
  if (!html || html === "<p></p>")
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm" style={{ backgroundColor: bgColor }}>
        No content
      </div>
    )
  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: bgColor }}>
      <div className="rich-content px-10 py-8 max-w-4xl mx-auto" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
