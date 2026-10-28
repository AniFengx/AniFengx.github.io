(function () {
  'use strict';

  if (window.__aniSearchReady) return;
  window.__aniSearchReady = true;

  document.addEventListener('DOMContentLoaded', function () {
    var input = document.querySelector('.search-input');
    var container = document.querySelector('.search-result-container');
    if (!input || !container || typeof LocalSearch === 'undefined') return;

    var search = new LocalSearch({
      path: CONFIG.path,
      top_n_per_article: CONFIG.localsearch.top_n_per_article,
      unescape: false
    });
    var state = 'idle';
    var loadingPromise = null;
    var inputTimer;

    function refreshLinks() {
      if (typeof pjax === 'object') pjax.refresh(container);
    }

    function status(text) {
      var element = document.createElement('p');
      element.className = 'search-status';
      element.setAttribute('role', 'status');
      element.setAttribute('aria-live', 'polite');
      element.textContent = text;
      return element;
    }

    function feedback(message, retry) {
      container.classList.add('no-result');
      container.replaceChildren();
      var box = document.createElement('div');
      box.className = 'search-feedback';
      box.appendChild(status(message));
      if (retry) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn search-retry';
        button.textContent = '重新加载';
        box.appendChild(button);
      } else {
        var hint = document.createElement('p');
        hint.textContent = '试试更短的关键词，或从这些主题开始：';
        box.appendChild(hint);
        var suggestions = document.createElement('div');
        suggestions.className = 'search-suggestions';
        ['Java', 'MySQL', 'WSL'].forEach(function (word) {
          var button = document.createElement('button');
          button.type = 'button';
          button.dataset.searchQuery = word;
          button.textContent = word;
          suggestions.appendChild(button);
        });
        box.appendChild(suggestions);
      }
      var browse = document.createElement('a');
      browse.href = CONFIG.root + 'categories/';
      browse.textContent = '按分类浏览';
      box.appendChild(browse);
      container.appendChild(box);
      refreshLinks();
    }

    function appendHighlighted(parent, text, hits, start, end) {
      var cursor = start;
      hits.forEach(function (hit) {
        var position = hit.position;
        var last = position + hit.word.length;
        if (position < cursor || position >= end || last > end) return;
        parent.appendChild(document.createTextNode(text.slice(cursor, position)));
        var mark = document.createElement('mark');
        mark.className = 'search-keyword';
        mark.textContent = text.slice(position, last);
        parent.appendChild(mark);
        cursor = last;
      });
      parent.appendChild(document.createTextNode(text.slice(cursor, end)));
    }

    function matchesFor(keywords) {
      return search.datas.map(function (article, index) {
        var title = search.getIndexByWord(keywords, article.title);
        var content = search.getIndexByWord(keywords, article.content);
        return {
          article: article, id: index, titleHits: title[0], contentHits: content[0],
          hitCount: title[0].length + content[0].length,
          includedCount: new Set(Array.from(title[1]).concat(Array.from(content[1]))).size
        };
      }).filter(function (result) { return result.hitCount > 0; });
    }

    function resultElement(result, keywords) {
      var article = result.article;
      var item = document.createElement('li');
      var link = document.createElement('a');
      link.className = 'search-result-title';
      var url = new URL(article.url, location.origin + CONFIG.root);
      url.searchParams.set('highlight', keywords.join(' '));
      link.href = url.pathname + url.search + url.hash;
      appendHighlighted(link, article.title, result.titleHits, 0, article.title.length);
      item.appendChild(link);
      if (article.content) {
        var snippet = document.createElement('p');
        snippet.className = 'search-result';
        var start = result.contentHits.length ? Math.max(0, result.contentHits[0].position - 40) : 0;
        var end = Math.min(article.content.length, start + 160);
        if (start > 0) snippet.appendChild(document.createTextNode('…'));
        appendHighlighted(snippet, article.content, result.contentHits, start, end);
        if (end < article.content.length) snippet.appendChild(document.createTextNode('…'));
        item.appendChild(snippet);
      }
      return item;
    }

    function renderResults() {
      if (state === 'loading') {
        container.classList.add('no-result');
        container.replaceChildren(status('正在加载搜索，请稍候…'));
        return;
      }
      if (state === 'error') {
        feedback('搜索暂时无法加载，请重试。', true);
        return;
      }
      var query = input.value.trim();
      if (!query) {
        feedback('输入关键词，查找文章标题和正文。', false);
        return;
      }
      if (!search.isfetched) return;
      var keywords = query.toLowerCase().split(/[-\s]+/).filter(Boolean);
      var results = matchesFor(keywords);
      if (!results.length) {
        feedback('没有找到与“' + query + '”相关的文章。', false);
        return;
      }
      results.sort(function (a, b) {
        return b.includedCount - a.includedCount || b.hitCount - a.hitCount || b.id - a.id;
      });
      container.classList.remove('no-result');
      var list = document.createElement('ul');
      list.className = 'search-result-list';
      results.forEach(function (result) { list.appendChild(resultElement(result, keywords)); });
      container.replaceChildren(status('找到 ' + results.length + ' 篇相关文章'), list);
      refreshLinks();
    }

    function readIndex(text) {
      var rows;
      if (/\.json(?:\?|$)/i.test(CONFIG.path)) {
        rows = JSON.parse(text);
        if (!Array.isArray(rows)) throw new Error('Invalid search index');
      } else {
        var xml = new DOMParser().parseFromString(text, 'application/xml');
        if (xml.querySelector('parsererror') || xml.documentElement.tagName !== 'search') throw new Error('Invalid search index');
        rows = Array.from(xml.querySelectorAll('entry')).map(function (entry) {
          return {
            title: entry.querySelector('title') ? entry.querySelector('title').textContent : '',
            content: entry.querySelector('content') ? entry.querySelector('content').textContent : '',
            url: entry.querySelector('url') ? entry.querySelector('url').textContent : ''
          };
        });
      }
      return rows.filter(function (row) {
        if (!row || typeof row.title !== 'string' || typeof row.url !== 'string') return false;
        try {
          var url = new URL(row.url, location.origin + CONFIG.root);
          return url.origin === location.origin && url.pathname.startsWith(CONFIG.root);
        } catch (_) { return false; }
      }).map(function (row) {
        return {
          title: row.title.trim(),
          content: plainContent(String(row.content || '')),
          url: row.url
        };
      }).filter(function (row) { return row.title; });
    }

    function plainContent(value) {
      var decoder = document.createElement('textarea');
      decoder.innerHTML = value.replace(/<[^>]+>/g, '');
      return decoder.value.trim();
    }

    function ensureLoaded() {
      if (search.isfetched) { renderResults(); return Promise.resolve(true); }
      if (loadingPromise) return loadingPromise;
      state = 'loading';
      renderResults();
      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, 8000);
      loadingPromise = fetch(CONFIG.path, { signal: controller.signal }).then(function (response) {
        if (!response.ok) throw new Error('Search unavailable');
        return response.text();
      }).then(function (text) {
        search.datas = readIndex(text);
        search.isfetched = true;
        state = 'ready';
        renderResults();
        return true;
      }).catch(function () {
        state = 'error';
        renderResults();
        return false;
      }).finally(function () {
        clearTimeout(timeout);
        loadingPromise = null;
      });
      return loadingPromise;
    }

    function close() { document.body.classList.remove('search-active'); }

    document.addEventListener('click', function (event) {
      var target = event.target.closest && event.target.closest('.popup-trigger');
      if (target) {
        document.body.classList.add('search-active');
        ensureLoaded();
        requestAnimationFrame(function () { input.focus(); });
      }
      if (event.target.closest && event.target.closest('.popup-btn-close')) close();
      if (event.target.classList && event.target.classList.contains('search-pop-overlay')) close();
      if (event.target.closest && event.target.closest('.search-retry')) ensureLoaded();
      var suggestion = event.target.closest && event.target.closest('[data-search-query]');
      if (suggestion) {
        input.value = suggestion.dataset.searchQuery;
        renderResults();
        input.focus();
      }
    });
    input.addEventListener('input', function () {
      clearTimeout(inputTimer);
      inputTimer = setTimeout(renderResults, 100);
    });
    window.addEventListener('keyup', function (event) { if (event.key === 'Escape') close(); });
    document.addEventListener('pjax:success', function () {
      search.highlightSearchWords(document.querySelector('.post-body'));
      close();
    });
    search.highlightSearchWords(document.querySelector('.post-body'));
    if (CONFIG.localsearch.preload) ensureLoaded();
  });
}());
