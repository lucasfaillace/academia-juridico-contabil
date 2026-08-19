"use client";

import { CornerDownRight, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Comment = {
  id: string;
  parentId: string | null;
  authorName: string;
  body: string;
  isAdmin: boolean;
  createdAt: string;
};

type CommentNode = Comment & { children: CommentNode[] };

function commentTree(comments: Comment[]) {
  const nodes = new Map(comments.map((comment) => [comment.id, { ...comment, children: [] as CommentNode[] }]));
  const roots: CommentNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function formatCommentDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value)).replace(".", "");
}

function CommentForm({
  parentId,
  isAdmin,
  adminName,
  onCancel,
  onPublished,
}: {
  parentId?: string;
  isAdmin: boolean;
  adminName?: string;
  onCancel?: () => void;
  onPublished: (comment: Comment) => void;
}) {
  const [authorName, setAuthorName] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setStatus("");
    const slug = window.location.pathname.split("/").filter(Boolean).at(-1);
    const response = await fetch(`/api/articles/${encodeURIComponent(slug || "")}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authorName: isAdmin ? adminName || "Autor" : authorName, body, parentId }),
    });
    const data = await response.json();
    setSending(false);
    if (!response.ok) {
      setStatus(data.error || "Não foi possível publicar.");
      return;
    }
    setAuthorName("");
    setBody("");
    setStatus("Comentário publicado.");
    onPublished(data);
    onCancel?.();
  }

  return (
    <form className="comment-form" onSubmit={submit}>
      {isAdmin ? (
        <p className="comment-admin-notice">Você responderá como <strong>{adminName || "Autor"}</strong>.</p>
      ) : (
        <label>
          Seu nome
          <input value={authorName} onChange={(event) => setAuthorName(event.target.value)} maxLength={100} required />
        </label>
      )}
      <label>
        {parentId ? "Sua resposta" : "Seu comentário"}
        <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} rows={parentId ? 3 : 4} required />
      </label>
      <div className="comment-form-actions">
        <button className="button primary" type="submit" disabled={sending}>{sending ? "Publicando…" : parentId ? "Publicar resposta" : "Publicar comentário"}</button>
        {onCancel && <button className="button secondary" type="button" onClick={onCancel}>Cancelar</button>}
      </div>
      {status && <p className="comment-form-status" aria-live="polite">{status}</p>}
    </form>
  );
}

function CommentThread({
  node,
  depth,
  isAdmin,
  adminName,
  onPublished,
}: {
  node: CommentNode;
  depth: number;
  isAdmin: boolean;
  adminName?: string;
  onPublished: (comment: Comment) => void;
}) {
  const [replying, setReplying] = useState(false);
  return (
    <li className="comment-item" style={{ marginLeft: `${Math.min(depth, 4) * 18}px` }}>
      <article>
        <header>
          <strong>{node.authorName}</strong>
          {node.isAdmin && <span className="author-badge">Autor</span>}
          <time dateTime={node.createdAt}>{formatCommentDate(node.createdAt)}</time>
        </header>
        <p>{node.body}</p>
        <button className="comment-reply" type="button" onClick={() => setReplying((value) => !value)}>
          <CornerDownRight size={14} aria-hidden="true" />Responder
        </button>
        {replying && (
          <CommentForm
            parentId={node.id}
            isAdmin={isAdmin}
            adminName={adminName}
            onCancel={() => setReplying(false)}
            onPublished={onPublished}
          />
        )}
      </article>
      {node.children.length > 0 && (
        <ol>
          {node.children.map((child) => (
            <CommentThread key={child.id} node={child} depth={depth + 1} isAdmin={isAdmin} adminName={adminName} onPublished={onPublished} />
          ))}
        </ol>
      )}
    </li>
  );
}

export function ArticleComments({ slug }: { slug: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminName, setAdminName] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/articles/${encodeURIComponent(slug)}/comments`)
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (!active) return;
        setLoading(false);
        if (!response.ok) {
          setError(data.error || "Não foi possível carregar os comentários.");
          return;
        }
        setComments(data.comments);
        setIsAdmin(Boolean(data.isAdmin));
        setAdminName(data.adminName);
      });
    return () => { active = false; };
  }, [slug]);
  const tree = useMemo(() => commentTree(comments), [comments]);
  const onPublished = (comment: Comment) => setComments((current) => [...current, comment]);

  return (
    <section className="article-comments" id="comentarios" aria-labelledby="comments-title">
      <div className="comments-heading">
        <MessageCircle aria-hidden="true" />
        <div>
          <h2 id="comments-title">Comentários</h2>
          <p>Espaço para perguntas, observações e diálogo entre os leitores.</p>
        </div>
      </div>
      <CommentForm isAdmin={isAdmin} adminName={adminName} onPublished={onPublished} />
      {loading && <p className="comments-state">Carregando comentários…</p>}
      {error && <p className="comments-state" role="alert">{error}</p>}
      {!loading && !error && !tree.length && <p className="comments-state">Ainda não há comentários. Inicie a discussão.</p>}
      {tree.length > 0 && (
        <ol className="comment-list">
          {tree.map((node) => <CommentThread key={node.id} node={node} depth={0} isAdmin={isAdmin} adminName={adminName} onPublished={onPublished} />)}
        </ol>
      )}
    </section>
  );
}
