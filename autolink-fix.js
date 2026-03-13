// ── Auto-Link Articles (Fixed) ────────────────────────────────────────────────
// Replaces buildAutoLinkIndex + autoLinkArticles to eliminate false positives.
//
// Root causes of false positives in the original:
//   1. Tags and keywords like "space", "time", "field", "event", "three",
//      "pattern", "operator" etc. are common English words — linking them
//      produces noise rather than signal.
//   2. Minimum term length was only 3 characters.
//   3. No distinction between high-confidence matches (full multi-word titles)
//      and low-confidence ones (single generic words from tags/keywords).
//   4. Single words extracted from multi-word article titles could match
//      anywhere (e.g., "Emergent" from "Time as Emergent Dimension").
//
// Fix strategy:
//   - Full article titles are always valid link terms (highest confidence).
//   - Single-word terms (from titles, tags, keywords) are checked against
//     a stop list of common English words AND domain-generic EO terms that
//     appear too broadly to be useful as links.
//   - Minimum term length raised to 4 for multi-word terms, 5 for single-word.
//   - Only the first occurrence of each term per article is linked (unchanged).
// ──────────────────────────────────────────────────────────────────────────────

// Words that are too common or too domain-generic to auto-link.
// Covers: common English, common technical terms, and EO terms that appear
// on nearly every page (making them noise rather than signal).
var AUTOLINK_STOP_WORDS = new Set([
  // ── Common English ──
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'has', 'his', 'how', 'its', 'may',
  'new', 'now', 'old', 'see', 'way', 'who', 'did', 'get', 'let', 'say',
  'she', 'too', 'use', 'also', 'been', 'call', 'each', 'find', 'from',
  'have', 'here', 'into', 'just', 'know', 'like', 'long', 'look', 'make',
  'many', 'more', 'most', 'much', 'must', 'name', 'only', 'over', 'part',
  'some', 'such', 'take', 'than', 'that', 'them', 'then', 'they', 'this',
  'time', 'very', 'what', 'when', 'will', 'with', 'work', 'about', 'after',
  'being', 'could', 'every', 'first', 'great', 'never', 'other', 'right',
  'shall', 'their', 'there', 'these', 'thing', 'think', 'those', 'three',
  'under', 'water', 'where', 'which', 'while', 'world', 'would', 'should',
  'still', 'between', 'through',
  // ── Common technical / academic ──
  'field', 'space', 'event', 'schema', 'table', 'value', 'state', 'system',
  'model', 'level', 'order', 'class', 'group', 'point', 'index', 'query',
  'type', 'data', 'form', 'rule', 'unit', 'role', 'mode', 'node', 'link',
  'path', 'case', 'test', 'code', 'view', 'base', 'kind', 'term', 'proof',
  'claim', 'phase', 'stage', 'frame', 'identity', 'register', 'pattern',
  'structure', 'relation', 'relational', 'temporal', 'domain', 'entity',
  'instance', 'abstract', 'concrete', 'formal', 'logical',
  // ── EO domain-generic terms (appear on nearly every page) ──
  'operator', 'operators', 'triad', 'triads', 'transformation', 'emergent',
  'ontology', 'existence', 'significance', 'interpretation', 'minimum',
  'ground', 'figure', 'axis', 'independence', 'phenomena'
]);

function buildAutoLinkIndex(currentSlug) {
  var terms = [];
  var seen = {};
  for (var i = 0; i < allPages.length; i++) {
    var p = allPages[i];
    if (p.slug === currentSlug) continue;
    if (p.visibility === 'private' || p.status === 'archived') continue;
    if (!p.hasContent && p.status !== 'published') continue;
    // Respect opt-out: articles tagged "no-autolink" won't be linked to
    if ((p.tags || []).indexOf('no-autolink') !== -1) continue;

    // ── Collect candidate terms with confidence tiers ──
    var candidates = [];

    // Tier 1: Full title (always valid if ≥ 2 words or ≥ 6 chars)
    var title = (p.title || '').trim();
    if (title) {
      var titleWords = title.split(/\s+/);
      if (titleWords.length >= 2 || title.length >= 6) {
        candidates.push({ term: title, tier: 1 });
      }
    }

    // Tier 2: Explicit keywords (validated against stop list)
    var kw = p.keywords || [];
    for (var k = 0; k < kw.length; k++) {
      candidates.push({ term: (kw[k] || '').trim(), tier: 2 });
    }

    // Tier 3: Tags (validated against stop list, higher bar)
    var tags = p.tags || [];
    for (var t = 0; t < tags.length; t++) {
      candidates.push({ term: (tags[t] || '').trim(), tier: 3 });
    }

    for (var c = 0; c < candidates.length; c++) {
      var entry = candidates[c];
      var term = entry.term;
      if (!term) continue;

      var key = term.toLowerCase();
      if (seen[key]) continue;

      var wordCount = term.split(/\s+/).length;
      var isSingleWord = wordCount === 1;

      // ── Length gates ──
      // Multi-word phrases: min 4 chars total
      // Single words: min 5 chars
      if (isSingleWord && term.length < 5) continue;
      if (!isSingleWord && term.length < 4) continue;

      // ── Stop-word filtering for single words ──
      if (isSingleWord && AUTOLINK_STOP_WORDS.has(key)) continue;

      // ── For tier 2/3 (keywords/tags), require multi-word OR
      //    a distinctive single word (not in stop list, ≥ 5 chars) ──
      // (stop list check above already handles this)

      // ── For titles: single common words from multi-word titles
      //    should NOT become link terms on their own.
      //    Only the full title is added (tier 1). ──
      // We do NOT split titles into individual words.

      seen[key] = true;
      terms.push({ term: term, slug: p.slug, title: p.title });
    }
  }
  // Sort longest-first so multi-word phrases match before their sub-words
  terms.sort(function(a, b) { return b.term.length - a.term.length; });
  return terms;
}

function autoLinkArticles(html, currentSlug) {
  if (!allPages || !allPages.length) return html;
  var terms = buildAutoLinkIndex(currentSlug);
  if (!terms.length) return html;

  var container = document.createElement('div');
  container.innerHTML = html;

  var linked = {};
  // Track how many links we've created per target slug to avoid over-linking
  var linkCountBySlug = {};
  var MAX_LINKS_PER_SLUG = 1; // Only link first occurrence per target article

  var SKIP_TAGS = {
    A: 1, CODE: 1, PRE: 1, SCRIPT: 1, STYLE: 1, TEXTAREA: 1,
    H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1,
    TH: 1  // Also skip table headers — terms in headers are structural
  };

  function walkTextNodes(node) {
    if (node.nodeType === 3) {
      processTextNode(node);
    } else if (node.nodeType === 1 && !SKIP_TAGS[node.tagName]) {
      // Also skip nodes that are already inside an auto-link
      if (node.classList && node.classList.contains('auto-link')) return;
      var children = [];
      for (var i = 0; i < node.childNodes.length; i++) children.push(node.childNodes[i]);
      for (var i = 0; i < children.length; i++) walkTextNodes(children[i]);
    }
  }

  function processTextNode(textNode) {
    var text = textNode.nodeValue;
    if (!text || !text.trim()) return;

    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];

      // Skip if we've already linked this exact term
      var linkKey = t.slug + '::' + t.term.toLowerCase();
      if (linked[linkKey]) continue;

      // Skip if we've already created enough links to this target
      if ((linkCountBySlug[t.slug] || 0) >= MAX_LINKS_PER_SLUG) continue;

      var escaped = t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp('\\b(' + escaped + ')\\b', 'i');
      var match = re.exec(text);
      if (!match) continue;

      // ── Context validation: skip if the match is inside a parenthetical
      //    that looks like an acronym definition, e.g., "(EO)" ──
      var charBefore = match.index > 0 ? text[match.index - 1] : '';
      var charAfter = match.index + match[0].length < text.length
        ? text[match.index + match[0].length] : '';
      if (charBefore === '(' && charAfter === ')') continue;

      var before = text.substring(0, match.index);
      var matched = text.substring(match.index, match.index + match[0].length);
      var after = text.substring(match.index + match[0].length);

      var beforeNode = document.createTextNode(before);
      var link = document.createElement('a');
      link.setAttribute('onclick', "navigate('" + t.slug.replace(/'/g, "\\'") + "')");
      link.setAttribute('class', 'auto-link');
      link.setAttribute('title', t.title);
      link.textContent = matched;
      var afterNode = document.createTextNode(after);

      var parent = textNode.parentNode;
      parent.insertBefore(beforeNode, textNode);
      parent.insertBefore(link, textNode);
      parent.insertBefore(afterNode, textNode);
      parent.removeChild(textNode);

      linked[linkKey] = true;
      linkCountBySlug[t.slug] = (linkCountBySlug[t.slug] || 0) + 1;
      if (after.trim()) processTextNode(afterNode);
      return;
    }
  }

  walkTextNodes(container);
  return container.innerHTML;
}
