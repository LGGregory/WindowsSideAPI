//TODO rewrite to use stored account id instead of email

const squel = require('squel');
const bcrypt = require('bcrypt');

exports.createUser = async function (pool, user_email, password, fullname) {
    bcrypt.hash(password, 12).then( async (err,hash)=>{
    const cP = squel.insert()
        .into("accounts")
        .set("full_name", fullname)
        .set("email_address", user_email)
        .toParam();
    const pP = squel.insert()
        .into("pdata")
        .set("account_id", squel.select()
            .from("accounts")
            .field("account_id")
            .where("email_address = ?", user_email)
        )
        .set("hash", hash)
        .toParam();
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
        await connection.execute(cP.text, cP.values);
        await connection.execute(pP.text, pP.values);
        await connection.commit();
    }
    catch (err) {
        await connection.rollback();
        return false;
    }
    connection.release();
    return true;
});
}

exports.checkUser = async function (pool, user_email, password) {
    var lP = squel.select()
        .from("`accounts`")
        .left_join("`pdata`", null, "`accounts`.`account_id`=`pdata`.`account_id`")
        .where("`email_address` = ?", user_email)
        .toParam();
    const connection = await pool.getConnection();

    const [rows, fields] = await connection.execute(lP.text, lP.values);
    const match = await bcrypt.compare(password, rows[0].hash)
    connection.release();
    if (match){ 
        console.log(rows[0].full_name + " logged in");
        return {
            "authenticated": true,
            "name": rows[0].full_name,
            "email": rows[0].email_address
        };}
    else 
        return { "authenticated": false };
}

exports.getComputerInfo = async function (pool, user_email) {
    var cI = squel.select()
        .field("`c`.`computer_id`")
        .field("`computer_name`", "name")
        .field("`computer_styled_name`", "styled_name")
        .from("`computers`", "c")
        .where("`c`.`account_id` = ?", squel.select()
            .field("`account_id`")
            .from("`accounts`")
            .where("email_address = ?", user_email))
        .toParam();
    const connection = await pool.getConnection();
    var rows,fields;
    try{
        [rows,fields]= await connection.execute(cI.text, cI.values);
    } catch(err){
        return false;
    }
    return rows;
}


exports.createComputer = async function (pool, options) {
    console.log(options);
    const cI = squel.insert().into("`computers`")
    .set("`account_id`", 
        squel.select()
        .from("`accounts`")
        .field("`account_id`")
        .where("`email_address` = ?", options.email))
    .set("`computer_name`", options.computer_name)
    .set("`computer_styled_name`", options.styled_name)
    .toParam();
    //const sql = "INSERT INTO `computers` (`account_id`, `computer_name`, `computer_styled_name`) VALUES ((SELECT `account_id` FROM `accounts` WHERE `email_address` = ?), ?, ?);";
    
    try {
        await pool.execute(cI.text,cI.values);
    } catch (err) {
        console.log(err);
        return false;
    }
    return true;
}

/* 
    Options - 
    {
        email
        computer
        usages - [
            {
                usage
                value
            }
        ]
    }
*/

//this is wrong
exports.updateUsages = async function (pool, options) {
    if (!options.email) {
        throw new error("email missing");
    } else if (!options.computer_name) {
        throw new error("computer missing");
    } else if (!options.usages || options.usages.length == 0) {
        throw new error("no changes");
    }
    
    const req = squel.select().field("`a`.`account_id`").field("`c`.`computer_id`").from("`computers`", "c")
        .join("`accounts`", "a", "`a`.`account_id` = `c`.`account_id`")
        .where("`a`.`email_address` = ?", options.email)
        .where("`c`.`computer_name` = ?", options.computer_name)
        .toParam();
    const rep = "REPLACE INTO `computeruses` (`account_id`, `computer_id`, `usage_id`, `value`) values (?, ?, (SELECT `usage_id` FROM `usages` WHERE `usage_name` = ?), ?);"
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    const [fields] = await conn.execute(req.text, req.values);
    if (fields.length == 0) {
        
        await conn.rollback();
        return false;
    }
    try {
        for (let i = 0; i < options.usages.length; i++) {
            await conn.execute(
                rep,
                [
                    fields[0].account_id,
                    fields[0].computer_id,
                    options.usages[i].usage_name,
                    options.usages[i].value
                ]
            );
        }
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        return false;
    }
    conn.release();
    return true;
}

exports.getUsages = async function (pool, email, computer_name) {
    const sql = "select `u`.`usage_id`, `u`.`usage_name`, ifnull(`cu`.`value`,0) as value from `usages` `u` left join (select `usage_id`, `value` from `computeruses` where `computer_id` = ( select `computer_id` from `computers` where (`computer_name` = ?) and (`account_id` = (select `account_id` from `accounts` where (`email_address` = ?))))) `cu` on `u`.`usage_id` = `cu`.`usage_id` order by `u`.`usage_id` asc;"
    try {
        [data, options] = await pool.execute(sql, [computer_name, email]);
    } catch (err) {
        return false;
    }
    data.forEach((usage)=>{
        usage.value = (usage.value === 1);
    })
    return data;
}

exports.getComputerNameFromIP = async function(pool, ip){
    const sql = "select `computer_name` from `computers` where `ip_address` = ?";
    try {
        [data] = await pool.execute(sql, [ip]);
        
    } catch(err){
        return false;
    } 
    return data;
}

exports.setComputerIP = async function(pool, email, computer_name, ip){
    const sql = "update `computers` set `ip_address` = ? where `computer_name` = ? and `account_id` = (select `account_id` from `accounts` where `email_address` = ?)";
    try{
        await pool.execute(sql, [
            ip,
            computer_name,
            email
        ]);
    }catch (err){
        return false;
    }
    return true;
}
