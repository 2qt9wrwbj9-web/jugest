import subprocess,sys
for f in ['scripts/v488_a.py','scripts/v488_b.py','scripts/v488_c.py','scripts/v488_d.py']:
    subprocess.check_call([sys.executable,f])
print('v4.8.8 patch complete - retry 5')
