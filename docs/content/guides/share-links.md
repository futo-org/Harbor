---

title: Share Links
sidebar_label: Share Links
---

# Share Links

A share link opens Harbor's New Post composer with the text already filled in.
Use it for a "Share on Harbor" button on your website. For example,
[share these docs](https://harbor.social/intent/compose?text=Reading%20the%20Harbor%20docs&url=https%3A%2F%2Fjoin.harbor.social%2Fdocs%2Fguides%2Fshare-links).
The user still reviews the content and presses Post.

```
https://harbor.social/intent/compose?text=...&url=...
```

Both parameters are optional:

- **`text`**: the post text, such as the page title or a short comment. It can
  contain links too.
- **`url`**: a link to add after the text, if you'd rather keep it separate.

On a phone with the Harbor app installed, the link opens the app instead of the
website.

## Encoding

Encode each value with `encodeURIComponent` (or your language's equivalent), so
spaces, `&`, `#`, `+` and line breaks survive:

```js
const shareUrl =
  'https://harbor.social/intent/compose' +
  `?text=${encodeURIComponent(document.title)}` +
  `&url=${encodeURIComponent(location.href)}`;
```

## Length

A post is up to 2000 characters, counting the link.

## Example button

```html
<a
  href="https://harbor.social/intent/compose?text=How%20we%20built%20it&url=https%3A%2F%2Fexample.com%2Fblog%2Fhow-we-built-it"
  target="_blank"
  rel="noopener"
>
  Share on Harbor
</a>
```
