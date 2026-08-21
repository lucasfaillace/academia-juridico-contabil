import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedArticleImageSource, sanitizeArticleContent } from "../lib/article-content-security.ts";

test("aceita somente imagens locais ou incorporadas em formato permitido", () => {
  assert.equal(isAllowedArticleImageSource("/media/quadro.webp"), true);
  assert.equal(isAllowedArticleImageSource("data:image/webp;base64,UklGRg=="), true);
  assert.equal(isAllowedArticleImageSource("https://example.com/quadro.webp"), false);
  assert.equal(isAllowedArticleImageSource("//example.com/quadro.webp"), false);
  assert.equal(isAllowedArticleImageSource("/media\\..\\segredo"), false);
});

test("remove hotlink de imagens sem impedir links bibliográficos externos", () => {
  const result = sanitizeArticleContent(
    '<p><a href="https://example.com/obra">Obra</a></p>'
      + '<figure data-article-image="" data-image-original-src="https://example.com/original.png" data-image-mobile-src="/media/mobile.webp">'
      + '<picture><source srcset="https://example.com/mobile.png 600w"><img src="https://example.com/imagem.png" alt="Quadro"></picture>'
      + '</figure>',
  );

  assert.match(result, /href="https:\/\/example\.com\/obra"/);
  assert.match(result, /data-image-mobile-src="\/media\/mobile\.webp"/);
  assert.doesNotMatch(result, /example\.com\/(?:original|mobile|imagem)/);
  assert.match(result, /<img alt="Quadro" loading="lazy" decoding="async" \/>/);
});

test("preserva as duas variantes locais da imagem editorial", () => {
  const result = sanitizeArticleContent(
    '<figure data-article-image="" data-image-original-src="/media/original.webp" data-image-mobile-src="/media/mobile.webp">'
      + '<picture><source media="(max-width: 600px)" srcset="/media/mobile.webp" type="image/webp">'
      + '<img src="/media/original.webp" alt="Balanço"></picture></figure>',
  );

  assert.match(result, /data-image-original-src="\/media\/original\.webp"/);
  assert.match(result, /data-image-mobile-src="\/media\/mobile\.webp"/);
  assert.match(result, /srcset="\/media\/mobile\.webp"/);
  assert.match(result, /src="\/media\/original\.webp"/);
});
