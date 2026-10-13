# JUGEST 並列判別・全台系 開発引き継ぎ

この開発ブランチは work/parallel-group-checkpoint-20261012。正式な再開地点は a563a04e4771420ef8689593e90cf6aa97e36c3d、元の判別基準は f728b2587a9bdd81541ccb50d3ae802a8492486a。

本番反映は未実施。deploy/vps／mainへの変更、デプロイ、DB・サービス変更は、反映直前のヒロの明示許可が必要。

まず [最新の再開記録](docs/development/completion-20261012/README.md) を読む。元の69分の作業は作り直さない。[途中成果の救出記録](docs/development/checkpoint-20261012/README.md)、旧ブランチのbundleと未保存差分を保持している。

- [数学仕様](docs/superpowers/specs/2026-10-10-parallel-group-judge-design.md)
- [最新の数学検証と限界](docs/development/completion-20261012/math-validation.md)
- [ブラウザ検証と確認版の開き方](docs/development/completion-20261012/browser-validation.md)
- [操作できる開発確認版](docs/development/completion-20261012/preview.html)
- [本番反映前の停止地点](docs/development/completion-20261012/deployment-handoff.md)
- [作業と判断の記録](docs/development/completion-20261012/progress.md)

最新版の店舗比較UI de812821 は開発側にのみ統合済み。新しいUI・個別結果・数学の回帰を実行し、最終レビューと警告表示修正を進めている。完了判定・最終保存SHAは最新の再開記録へ記す。
