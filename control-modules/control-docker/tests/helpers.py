############################################################
#  [*] Test helpers — the client and the fake processes
#
#  make_client builds the real Flask app in testing mode;
#  fake_process stands in for a finished Popen — routes only
#  ever read .returncode and call .communicate().
#
#  Used by:
#    - every suite in this package
############################################################

from types import SimpleNamespace

from app import create_app








############################################################
# make_client / fake_process / fake_response
############################################################

def make_client():
    app = create_app()
    app.testing = True
    return app.test_client()



def fake_process(returncode=0, stdout=b''):
    process = SimpleNamespace(returncode=returncode)
    process.communicate = lambda: (stdout, b'')
    return process



def fake_response(status_code=200, text=''):
    return SimpleNamespace(status_code=status_code, text=text)
