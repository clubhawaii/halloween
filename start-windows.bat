@echo off
chcp 65001 >nul
title Halloween Photo Booth (이 창을 닫으면 포토부스가 종료됩니다)
cd /d "%~dp0"
echo.
echo  HALLOWEEN CARD PHOTO BOOTH
echo  ------------------------------------------
echo  잠시 후 브라우저가 열립니다: http://localhost:8731
echo  행사 중에는 이 검은 창을 닫지 마세요.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "$root=(Get-Location).Path; $p=8731; $l=New-Object Net.HttpListener; $l.Prefixes.Add('http://localhost:'+$p+'/'); $l.Start(); Start-Process ('http://localhost:'+$p+'/'); $m=@{'.html'='text/html; charset=utf-8';'.js'='text/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.png'='image/png';'.jpg'='image/jpeg';'.jpeg'='image/jpeg';'.svg'='image/svg+xml';'.md'='text/plain; charset=utf-8'}; while($l.IsListening){ $c=$l.GetContext(); $u=[Uri]::UnescapeDataString($c.Request.Url.AbsolutePath.TrimStart('/')); if($u -eq ''){$u='index.html'}; $f=[IO.Path]::GetFullPath((Join-Path $root $u)); if($f.StartsWith($root) -and (Test-Path $f -PathType Leaf)){ $b=[IO.File]::ReadAllBytes($f); $e=[IO.Path]::GetExtension($f).ToLower(); if($m.ContainsKey($e)){$c.Response.ContentType=$m[$e]}; $c.Response.ContentLength64=$b.Length; $c.Response.OutputStream.Write($b,0,$b.Length) } else { $c.Response.StatusCode=404 }; $c.Response.Close() }"
pause
