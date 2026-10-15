Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

' このスクリプトがあるフォルダをカレントディレクトリに設定
currentDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir

' APIサーバーを完全非表示(0)でバックグラウンド実行
WshShell.Run "cmd /c npm run api", 0, False

' 3秒待機
WScript.Sleep 3000

' Botを完全非表示(0)でバックグラウンド実行
WshShell.Run "cmd /c python excursion/bot.py", 0, False