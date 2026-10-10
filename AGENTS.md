<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Chat attachments and generated images live in the private `omni-files` storage bucket under `<userId>/`, referenced in message markdown by long-lived signed URLs; the chat server turns user-message image/PDF links into model media parts. Why: the workspace blocks public buckets and messages stay plain text.
