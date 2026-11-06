/** shell 单引号转义，公开站点地址也不能被当作命令执行。 */
function quote(value: string): string {
    return `'${value.replaceAll("'", `'"'"'`)}'`;
}

/** 令牌仅由 Python 从继承的环境读取，不进入进程参数或临时文件。 */
export function agentSkillUpdateCommand(origin: string): string {
    const download = [
        "import http.client,os,re,sys,urllib.parse",
        'token=os.environ["WRONG_NOTEBOOK_TOKEN"]',
        're.fullmatch(r"wnb_[A-Za-z0-9_-]{43}",token) or sys.exit("Invalid token environment variable")',
        "url=urllib.parse.urlsplit(sys.argv[1])",
        'connection=(http.client.HTTPSConnection if url.scheme=="https" else http.client.HTTPConnection)(url.netloc,timeout=30)',
        'connection.request("GET",url.path,headers={"Authorization":"Bearer "+token})',
        "response=connection.getresponse()",
        'response.status==200 or sys.exit("Download failed: HTTP "+str(response.status))',
        "data=response.read(5242881)",
        'len(data)<=5242880 or sys.exit("Archive too large")',
        'open(sys.argv[2],"wb").write(data)',
    ].join("; ");
    return `(set +x; umask 077; [ "\${WRONG_NOTEBOOK_TOKEN:+set}" = set ] || exit 1; skill_tmp=$(mktemp -d) || exit 1; trap 'rm -rf "$skill_tmp"' EXIT; python3 -c ${quote(download)} ${quote(`${origin}/api/agent/skill`)} "$skill_tmp/skill.zip" && unset WRONG_NOTEBOOK_TOKEN && unzip -tq "$skill_tmp/skill.zip" >/dev/null && unzip -p "$skill_tmp/skill.zip" wrong-notebook-import/scripts/update.py > "$skill_tmp/update.py" && python3 "$skill_tmp/update.py" "$skill_tmp/skill.zip" "$HOME/.agents/skills/wrong-notebook-import")`;
}
