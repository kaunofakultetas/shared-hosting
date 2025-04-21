'use client';
import Sidebar from "@/components/Admin/Sidebar/Sidebar";
import Navbar from "@/components/Navbar/Navbar";
import Widget from "@/components/Admin/Widget/Widget";
import StudentProgress from "@/components/Admin/Widget/StudentProgress";


import React, { useState, useEffect } from "react";
import styles from "./Home.module.scss";
import axios from "axios";



import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import QuestionMarkOutlinedIcon from '@mui/icons-material/QuestionMarkOutlined';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';
import DirectionsCarOutlinedIcon from '@mui/icons-material/DirectionsCarOutlined';
import ElectricBoltIcon from '@mui/icons-material/ElectricBolt';
import EngineeringIcon from '@mui/icons-material/Engineering';
import TerminalOutlinedIcon from '@mui/icons-material/TerminalOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import CastForEducationOutlinedIcon from '@mui/icons-material/CastForEducationOutlined';





const Home = ({ authdata }) => {

  const [data, setData] = useState();


  const REFRESH_TIME = 2;
  let updateTimer;
  const [nextUpdate, setNextUpdate] = useState(0);
  const updateCount = (getData) => {
    updateTimer = !updateTimer && setInterval(() => {
      setNextUpdate(prevTime => prevTime - 1);
    }, 1000)
    
    if (nextUpdate === 0) {
      getData();
      setNextUpdate(REFRESH_TIME);
    }
  }

  useEffect(() => {
    
    async function getData() {
      const response = await axios.get("/api/admin/home", { withCredentials: true });
      setData(response.data);
    }
    updateCount(getData);
    return () => clearInterval(updateTimer);
  }, [nextUpdate]);




  const getIconFromName = (iconName) => {
    //const iconColor = "rgba(255, 0, 0, 0.2)";
    //const iconColor = "crimson";

    const iconBackground = "rgb(230, 65, 100, 1.0)";
    const iconColor = "white";

    switch (iconName) {
      case 'PersonOutlinedIcon':
        return <PersonOutlinedIcon className={styles.icon} style={{ color: iconColor, backgroundColor: iconBackground }} />;
      case 'QuestionMarkOutlinedIcon':
        return <QuestionMarkOutlinedIcon className={styles.icon} style={{ color: iconColor, backgroundColor: iconBackground }} />;


      case 'CreditCardOutlinedIcon':
        return <CreditCardOutlinedIcon className={styles.icon} style={{ color: iconColor, backgroundColor: iconBackground }} />;
      case 'DirectionsCarOutlinedIcon':
        return <DirectionsCarOutlinedIcon className={styles.icon} style={{ color: iconColor, backgroundColor: iconBackground }} />;
      case 'PeopleOutlinedIcon':
        return <PeopleOutlinedIcon className={styles.icon} style={{ color: iconColor, backgroundColor: iconBackground }} />;
      case 'RecordVoiceOverIcon':
        return <RecordVoiceOverIcon className={styles.icon} style={{ color: iconColor, backgroundColor: iconBackground }} />;
      case 'ElectricBoltIcon':
        return <ElectricBoltIcon className={styles.icon} style={{ color: iconColor, backgroundColor: iconBackground }} />;
      case 'EngineeringIcon':
        return <EngineeringIcon className={styles.icon} style={{ color: iconColor, backgroundColor: iconBackground }} />;
      case 'TerminalOutlinedIcon':
        return <TerminalOutlinedIcon className={styles.icon} style={{ color: iconColor, backgroundColor: iconBackground }} />;
      case 'SchoolOutlinedIcon':
        return <SchoolOutlinedIcon className={styles.icon} style={{ color: iconColor, backgroundColor: iconBackground }} />;
      case 'CastForEducationOutlinedIcon':
        return <CastForEducationOutlinedIcon className={styles.icon} style={{ color: iconColor, backgroundColor: iconBackground }} />;
      default:
        return <CreditCardOutlinedIcon className={styles.icon} style={{ color: iconColor, backgroundColor: iconBackground }} />;
      }
  }



  if (data === undefined) {
    return <></>;
  }
  

  return (
    <div>
      <Navbar />
      <div style={{display: 'flex', flexDirection: 'row'}}> 
        
        <Sidebar authdata={authdata}/>

        <div style={{minHeight: 'calc(100vh - 125px)', width: '100%', background: '#EBECEF', display: 'flex', flexDirection: 'column', paddingTop: 20 }}>
          
          <div style={{display: 'flex', padding: 10, gap: 10}}>
            <Widget className={styles.widget} text="Naudotojų" count={data.studentscount} icon={getIconFromName("PeopleOutlinedIcon")} link="/admin/users"/>
            <Widget className={styles.widget} text="Docker Konteinerių" count={data.enabledquestionscount} icon={getIconFromName("QuestionMarkOutlinedIcon")}/>
          </div>
         
          <div style={{display: 'flex', padding: 10, gap: 10}}>
            
          </div>

        </div>
      </div>
      <div style={{background: 'rgb(123, 0, 63)', height: 30, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', fontSize: "0.7em"}}> 
        Copyright © | All Rights Reserved | VUKnF
      </div>
    </div>
  );
};

export default Home;
