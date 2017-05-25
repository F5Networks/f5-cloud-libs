function wait-for-bigip() {
    echo "** BigIP waiting ..."
    bigstart_wait mcpd ready
    while ! tmsh show sys mcp-state field-fmt | grep -qE 'phase.+running' || pidof -x mprov.pl >/dev/null 2>&1; do sleep 1; done
    if [[ ! $(getdb Provision.CPU.asm) == 0 ]]; then perl -MF5::ASMReady -e '$|++; do {print "waiting for asm...\n"; sleep(1)} while !F5::ASMReady::is_asm_ready()'; fi
    echo "** BigIp ready."
}