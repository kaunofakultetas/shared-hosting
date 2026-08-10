############################################################
#  [*] Docker controller — app entry point
#
#  Thin launcher, same shape as the backend's old entry
#  point: `python3 main.py --http` builds the Flask app from
#  the app/ package and serves it on :8000. Flask's threaded
#  dev server on purpose — one small internal service, and
#  the threading lets a slow du overlap the 3-second status
#  calls.
############################################################


import sys
import os
from app import create_app


# Environment variables
APP_DEBUG = os.getenv('APP_DEBUG', 'false').lower() == "true"








if __name__ == '__main__':

    if(len(sys.argv) == 1):
        print("Empty")


    elif(sys.argv[1] == "--http"):
        app = create_app()
        app.run(host='0.0.0.0', port=8000, debug=APP_DEBUG)
