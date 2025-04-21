import React from 'react';
import Login from '@/systemPages/Login/Login';
import { cookies } from 'next/headers'


export default async function Page() {
  async function deleteTokens() {
    "use server";
    const cookieStore = await cookies();
    cookieStore.delete("session");
  }  
  return <Login deleteTokens={deleteTokens}/>;
}
