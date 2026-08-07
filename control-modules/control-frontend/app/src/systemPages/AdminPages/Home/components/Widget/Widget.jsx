// -----------------------------------------------------------
//  [*] Widget — one dashboard stat card
//
//  A white rounded card: label, big number (optionally
//  "running / total" when countSecondary is given), an
//  optional bottom link-styled text, an optional up/down
//  difference badge, and the icon bottom-right — wrapped in
//  a link when `link` is set.
//
//  Used by:
//    - Home.jsx — the Users / Virtual Servers / Domain Names
//      cards
// -----------------------------------------------------------

import { Link } from "react-router-dom";
import ArrowUpwardSharpIcon from '@mui/icons-material/ArrowUpwardSharp';
import ArrowDownwardSharpIcon from '@mui/icons-material/ArrowDownwardSharp';


export default function Widget({ text, bottomtext, count, countSecondary, icon, link, difference }) {

  // If countSecondary is provided, show as "count / countSecondary" format
  const hasSecondaryCount = countSecondary !== undefined && countSecondary !== null && countSecondary !== '—';

  return (
    <div className="flex justify-between flex-1 p-2.5 shadow-card rounded-[15px] h-[100px] w-full bg-white">

      {/* Left side */}
      <div className="flex flex-col justify-between">
        <span className="font-bold text-sm text-gray-400">{text}</span>

        {hasSecondaryCount ? (
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-light text-green-600">{count}</span>
            <span className="text-lg font-light text-gray-400">/</span>
            <span className="text-xl font-light text-gray-500">{countSecondary}</span>
          </div>
        ) : (
          <span className="text-3xl font-light text-gray-600">{count}</span>
        )}

        {bottomtext && (
          <span className="w-max text-xs border-b border-gray-400">{bottomtext}</span>
        )}
      </div>

      {/* Right side */}
      <div className="flex flex-col justify-between mr-2.5">
        {/* Difference badge */}
        <div className="flex">
          {difference > 0 && (
            <div className="flex items-center text-lg rounded bg-green-500 text-white py-0.5 px-1.5 ml-5">
              <ArrowUpwardSharpIcon fontSize="small" />
              {difference}
            </div>
          )}
          {difference < 0 && (
            <div className="flex items-center text-lg rounded bg-red-500 text-white py-0.5 px-1.5 ml-5">
              <ArrowDownwardSharpIcon fontSize="small" />
              {difference}
            </div>
          )}
          {!difference && <div className="ml-20"></div>}
        </div>

        {/* Icon */}
        <div className="flex justify-end">
          {link ? (
            <Link to={link} className="no-underline m-0 p-0">
              {icon}
            </Link>
          ) : (
            <div className="self-end">
              {icon}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
