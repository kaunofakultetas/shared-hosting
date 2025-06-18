'use client';
import Sidebar from "@/components/Admin/Sidebar/Sidebar";
import Navbar from "@/components/Navbar/Navbar"
import VirtualServersTable from "./VirtualServersTable/VirtualServersTable"
import toast, { Toaster } from 'react-hot-toast';

const VirtualServersPage = ({ authdata }) => {
  return (
    <div>
      <Navbar />
      <Toaster />
      <div style={{display: 'flex', flexDirection: 'row'}}> 
        <Sidebar authdata={authdata}/>
        <VirtualServersTable authdata={authdata}/>
      </div>
      <div style={{background: 'rgb(123, 0, 63)', height: 30, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', fontSize: "0.7em"}}> 
        Copyright © | All Rights Reserved | VUKnF
      </div>
    </div>

  )
}

export default VirtualServersPage;