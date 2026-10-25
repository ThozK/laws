# 三段法令ビューア

法・施行令・施行規則を３列に並べて読み易くした法律ビュアーのウェブサイトです。

デジタル庁が提供する法令APIを利用し、法令閲覧の先駆的OSSであるLawtextをベースに作成しています、

https://thozk.github.io/laws/

<img width="1133" height="813" alt="スクリーンショット 2026-10-25 23 11 32" src="https://github.com/user-attachments/assets/81110b2b-7d62-42f4-aa2b-13bd3a3f8954" />


<img width="1130" height="857" alt="スクリーンショット 2026-10-25 23 14 47" src="https://github.com/user-attachments/assets/09b10a4e-c69b-4e30-b960-57c74d36adb5" />



# 作成の動機

法令を読解するために従来から使用されてきた三段表を自動作成するツールが存在しなかったため作ってみました。

## データと制約

e-Gov法令API v2から表示時に取得します。

React / Viteの静的サイトです。

## ライセンス

法令HTML表示：Lawtext 0.2.3 / MIT License / Copyright (c) 2017-2026 yamachi

ライセンス全文は public/LAWText-LICENSE.txt にあります。移設・再配布時も残してください。
