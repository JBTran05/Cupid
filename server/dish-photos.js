// A photo of each dish, taken from its Wikipedia article.
const { fetchJson, memo } = require('./lib');

const cached = memo(24 * 60 * 60 * 1000, 500);

function dishPhoto(food) {
  if (!food.wiki) return Promise.resolve(null);
  return cached(food.id, async () => {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      redirects: '1',
      prop: 'pageimages',
      piprop: 'thumbnail|name',
      pithumbsize: '900',
      titles: food.wiki,
    });
    const json = await fetchJson(`https://en.wikipedia.org/w/api.php?${params}`);
    const page = json.query && json.query.pages && json.query.pages[0];
    if (!page || !page.thumbnail) return null;
    return {
      url: page.thumbnail.source,
      width: page.thumbnail.width,
      height: page.thumbnail.height,
      creditUrl: `https://en.wikipedia.org/wiki/File:${encodeURIComponent(page.pageimage)}`,
    };
  });
}

module.exports = { dishPhoto };
