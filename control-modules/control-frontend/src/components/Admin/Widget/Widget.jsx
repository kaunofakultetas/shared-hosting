import styles from "./Widget.module.scss";
import Link from "next/link";
import ArrowUpwardSharpIcon from '@mui/icons-material/ArrowUpwardSharp';
import ArrowDownwardSharpIcon from '@mui/icons-material/ArrowDownwardSharp';


const Widget = ({ text, bottomtext, count, icon, link, difference }) => {

  return (
    <div className={styles.widget} >
      
      <div className={styles.left}>
        <span className={styles.title}>{text}</span>
        <span className={styles.counter}>
          {count}
        </span>
        <span className={styles.link}>{bottomtext}</span>
      </div>
      
      
  
      <div className={styles.right}>

        {/* UP */}
        <div style={{display: 'flex'}}>

          

          {/* Difference */}
          {(difference > 0 &&
            <div className={`${styles.percentage} ${styles.positive}`} style={{padding: '3px', paddingRight: '5px', marginLeft: '20px'}}>
              <ArrowUpwardSharpIcon />
              {difference}
            </div>
          ) || (difference < 0 &&
            <div className={`${styles.percentage} ${styles.negative}`} style={{padding: '3px', paddingRight: '5px', marginLeft: '20px' }}>
              <ArrowDownwardSharpIcon />
              {difference}
            </div>
          ) || (
            <div
              style={{
                marginLeft: '80px'
              }}
            >
            </div>
          )}

        </div>


        {/* DOWN */}
        <div
          style={{
            display: 'flex',
            justifyContent:'flex-end'
          }}
        >
          {link?
            <Link href={link} style={{ textDecoration: "none", margin: 0, padding: 0 }}>
              <>{icon}</>
            </Link>
          :
            <div style={{alignSelf: 'end'}}>
              <>{icon}</>
            </div>
          }
        </div>
        
      </div>
    </div>
  );
};

export default Widget;
