############################################################
# Author:           Tomas Vanagas
# Updated:          2025-07-27
# Version:          1.0
# Description:      App entry point
############################################################


import sys
import os
from app import create_app


# Environment variables
APP_DEBUG = os.getenv('APP_DEBUG', 'false').lower() == "true"





if __name__ == '__main__':
    
    if(len(sys.argv) == 1):
        print("[*] Explanation is comming... ")

    elif(sys.argv[1] == "--http"):
        app = create_app()
        app.run(host='0.0.0.0', port=8000, debug=APP_DEBUG)




