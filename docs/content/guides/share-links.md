---

title: Share Links
sidebar_label: Share Links
---

# Share Links

A share link opens Harbor's New Post composer with the text already filled in.
The user still reviews the content and presses Post.

For example, [Share these docs](https://harbor.social/intent/compose?text=Reading%20the%20Harbor%20docs&url=https%3A%2F%2Fjoin.harbor.social%2Fdocs%2Fguides%2Fshare-links).

```
https://harbor.social/intent/compose?text=...&url=...
```

Both parameters are optional:

- **`text`**: the post text, such as the page title or a short comment. It can
  contain links too.
- **`url`**: a link to add after the text, if you'd rather keep it separate.

A post is up to 2000 characters, counting the link.

On a phone with the Harbor app installed, the link opens the app instead of the
website.

You can use a share link for a "Share on Harbor" button on your website.

## Encoding

Encode each value with `encodeURIComponent` (or your language's equivalent), so
spaces, `&`, `#`, `+` and line breaks survive:

```js
const shareUrl =
  'https://harbor.social/intent/compose' +
  `?text=${encodeURIComponent(document.title)}` +
  `&url=${encodeURIComponent(location.href)}`;
```
