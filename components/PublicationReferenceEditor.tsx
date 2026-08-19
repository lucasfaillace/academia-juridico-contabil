"use client";

import { Mark } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

const Superscript = Mark.create({
  name: "superscript",
  parseHTML: () => [{ tag: "sup" }],
  renderHTML: ({ HTMLAttributes }) => ["sup", HTMLAttributes, 0],
});

const Subscript = Mark.create({
  name: "subscript",
  parseHTML: () => [{ tag: "sub" }],
  renderHTML: ({ HTMLAttributes }) => ["sub", HTMLAttributes, 0],
});

const specialCharacters = ["§", "º", "ª", "°", "–", "—", "“", "”", "‘", "’", "…", "±", "×", "÷"];

export function PublicationReferenceEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        orderedList: false,
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      Superscript,
      Subscript,
    ],
    content: value || "<p></p>",
    onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    const next = value || "<p></p>";
    if (next !== editor.getHTML()) editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return <div className="reference-editor-loading">Carregando editor…</div>;
  const activeEditor = editor;

  function editLink() {
    const current = activeEditor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Endereço completo do hiperlink:", current || "https://");
    if (href === null) return;
    if (!href.trim()) {
      activeEditor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const normalizedHref = href.trim().startsWith("www.") ? `https://${href.trim()}` : href.trim();
    activeEditor.chain().focus().extendMarkRange("link").setLink({
      href: normalizedHref,
      target: "_blank",
      rel: "noopener noreferrer",
    }).run();
  }

  return (
    <div className="publication-reference-editor">
      <div
        className="reference-toolbar"
        role="toolbar"
        aria-label="Formatação da referência"
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) event.preventDefault();
        }}
      >
        <button type="button" aria-pressed={activeEditor.isActive("bold")} className={activeEditor.isActive("bold") ? "is-active" : ""} onClick={() => activeEditor.chain().focus().toggleBold().run()}><strong>N</strong><span className="sr-only">Negrito</span></button>
        <button type="button" aria-pressed={activeEditor.isActive("italic")} className={activeEditor.isActive("italic") ? "is-active" : ""} onClick={() => activeEditor.chain().focus().toggleItalic().run()}><em>I</em><span className="sr-only">Itálico</span></button>
        <button type="button" aria-pressed={activeEditor.isActive("underline")} className={activeEditor.isActive("underline") ? "is-active" : ""} onClick={() => activeEditor.chain().focus().toggleUnderline().run()}><u>S</u><span className="sr-only">Sublinhado</span></button>
        <button type="button" aria-pressed={activeEditor.isActive("link")} className={activeEditor.isActive("link") ? "is-active" : ""} onClick={editLink}>Link</button>
        <button type="button" aria-pressed={activeEditor.isActive("superscript")} className={activeEditor.isActive("superscript") ? "is-active" : ""} onClick={() => activeEditor.chain().focus().unsetMark("subscript").toggleMark("superscript").run()}>x<sup>2</sup><span className="sr-only">Sobrescrito</span></button>
        <button type="button" aria-pressed={activeEditor.isActive("subscript")} className={activeEditor.isActive("subscript") ? "is-active" : ""} onClick={() => activeEditor.chain().focus().unsetMark("superscript").toggleMark("subscript").run()}>x<sub>2</sub><span className="sr-only">Subscrito</span></button>
        <label className="special-character-control">
          <span className="sr-only">Inserir caractere especial</span>
          <select
            defaultValue=""
            aria-label="Inserir caractere especial"
            onChange={(event) => {
              if (event.target.value) activeEditor.chain().focus().insertContent(event.target.value).run();
              event.target.value = "";
            }}
          >
            <option value="">Caractere especial</option>
            {specialCharacters.map((character) => <option key={character} value={character}>{character}</option>)}
          </select>
        </label>
      </div>
      <EditorContent editor={activeEditor} />
    </div>
  );
}
