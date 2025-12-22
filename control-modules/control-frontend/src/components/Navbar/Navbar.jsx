'use client'
import styles from './navbar.module.scss';
import Link from "next/link";
import { Button } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';

const Navbar = ({ authdata }) => {

  return (
    <div className={styles.navbar}>
      <Link href="/" style={{ textDecoration: "none", marginLeft: 30, marginRight: 30 }}>
        <div>
          <img src='/img/vulogo.png' alt="avatar" />
        </div>
      </Link>
      <div className={styles.wrapper}>

        <div className={styles.search}>
          
          <Link href="/" style={{ textDecoration: "none" }}>
            <div style={{borderStyle: 'solid', borderWidth: 1, borderRadius: 15, color: 'white', borderColor: 'white', padding: 8, paddingLeft: 12, paddingRight: 12}}>
              App Hosting Platform
            </div>
          </Link>
        </div>

        <div className={styles.items}>
          
          {/* User Mini Widget */}
          <Link href="/account" style={{ textDecoration: "none" }} className={styles.item}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px',
              marginRight: '20px',
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <PersonIcon style={{ color: 'white', fontSize: '24px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ 
                  color: 'white', 
                  fontSize: '0.85em', 
                  fontWeight: '600',
                  lineHeight: '1.2'
                }}>
                  {authdata?.email || "User"}
                </span>
                <span style={{ 
                  color: 'rgba(255, 255, 255, 0.7)', 
                  fontSize: '0.7em',
                  lineHeight: '1.2'
                }}>
                  {authdata?.admin === 1 ? "Administrator" : "User"}
                </span>
              </div>
            </div>
          </Link>
          


          <Button
            variant="contained"
            // color="primary"
            style={{ background: 'rgb(123, 0, 63)', width: "100%", border: '1px solid rgba(255, 255, 255, 1)' }}
            onClick={() => { window.location.href = "/login" }}
          >
            Logout
          </Button>

        </div>
      </div>
    </div>
  );
};

export default Navbar;