'use client';
import styles from "./Sidebar.module.scss";
import { useState, useEffect } from "react";
import Link from "next/link";

// Collapse/Expand Sidebar
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';


import DashboardIcon from "@mui/icons-material/Dashboard";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import PublicIcon from '@mui/icons-material/Public';
import StorageIcon from '@mui/icons-material/Storage';
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import ImportContactsIcon from '@mui/icons-material/ImportContacts';
import SettingsIcon from '@mui/icons-material/Settings';
import ExtensionIcon from '@mui/icons-material/Extension';


// https://www.makeuseof.com/react-create-collapsible-side-navigation-menu/


const AdminSidebar = ({ authdata }) => {
  const [open, setopen] = useState(true);
  useEffect(() => {
    setopen(localStorage.getItem("sidebarOpen") !== "false");
  }, [])



  const toggleOpen = () => {
    var sidebarOpendNewValue = !open;
    setopen(sidebarOpendNewValue)
    localStorage.setItem('sidebarOpen', sidebarOpendNewValue);
  }




  return (
    <div className={styles.sidebar}>
      
      <div className={styles.center}>
        
        <ul>
          <button className={styles.sidebarCollapseBtn} onClick={toggleOpen}>
            {open? <KeyboardDoubleArrowLeftIcon style={{verticalAlign: 'middle'}}/>:<KeyboardDoubleArrowRightIcon style={{verticalAlign: 'middle'}}/>}
          </button>


          {/* ---- */}
          {open? <p className={styles.title}>CONTROL</p>:<p className={styles.title}>-----</p>}
          <Link href="/vm" style={{ textDecoration: "none" }}>
            <li>
              <ViewInArIcon className={styles.icon} />
              {open? <span>Virtual Servers</span>:<></>}
            </li>
          </Link>



          {/* ---- */}
          {open? <p className={styles.title}>INFORMATION</p>:<p className={styles.title}>-----</p>}
          <Link href="/docs" style={{ textDecoration: "none" }} target="_blank">
            <li>
              <ImportContactsIcon className={styles.icon} />
              {open? <span>Documentation</span>:<></>}
            </li>
          </Link>
          <Link href="https://awesome-docker-compose.com/apps" style={{ textDecoration: "none" }} target="_blank">
            <li>
              <ExtensionIcon className={styles.icon} />
              {open? <span>Examples</span>:<></>}
            </li>
          </Link>



          {/* ---- */}
          {authdata.admin === 1?
            <>
              {open? <p className={styles.title}>ADMIN</p>:<p className={styles.title}>-----</p>}
              {/* <Link href="/admin" style={{ textDecoration: "none" }}>
                <li>
                  <DashboardIcon className={styles.icon} />
                  {open? <span>Apžvalga</span>:<></>}
                </li>
              </Link> */}

              <Link href="/admin/users" style={{ textDecoration: "none" }}>
                <li>
                  <PersonOutlineIcon className={styles.icon} />
                  {open? <span>Users</span>:<></>}
                </li>
              </Link>

              <Link href="/dbgate" style={{ textDecoration: "none" }} target="_blank">
                <li>
                  <StorageIcon className={styles.icon} />
                  {open? <span>Database</span>:<></>}
                </li>
              </Link>
            </>
          :
            <></>
          }



          {/* ---- */}
          {open? <p className={styles.title}>ACCOUNT</p>:<p className={styles.title}>-----</p>}
          {/* <Link href="/user/settings" style={{ textDecoration: "none" }}>
            <li>
              <SettingsIcon className={styles.icon} />
              {open? <span>Settings</span>:<></>}
            </li>
          </Link> */}

          <Link href="/login" style={{ textDecoration: "none" }}>
            <li>
              <ExitToAppIcon className={styles.icon} />
              {open? <span>Logout</span>:<></>}
            </li>
          </Link>




        </ul>
      </div>
      
    </div>
  );
};

export default AdminSidebar;
