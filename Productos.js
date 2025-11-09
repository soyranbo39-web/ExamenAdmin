const pool = require('./connection')

async function ejecutarSeed(){
  try{
    const crearTabla = `CREATE TABLE IF NOT EXISTS products (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100),
      description VARCHAR(255),
      price DECIMAL(10,2),
      stock INT,
      created_at DATETIME
    )`;
    await pool.query(crearTabla);

    const crearUsers = `CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100),
      email VARCHAR(100) UNIQUE,
      created_at DATETIME,
      status INT
    )`;
    const crearPaymentTypes = `CREATE TABLE IF NOT EXISTS payment_types (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(50),
      description VARCHAR(150)
    )`;
    await pool.query(crearUsers);
    await pool.query(crearPaymentTypes);

    const insertPaymentTypes = `INSERT IGNORE INTO payment_types (name, description) VALUES
      ('Efectivo', 'Pago realizado en efectivo en tienda'),
      ('Tarjeta de Debito', 'Pago con tarjeta de debito bancaria'),
      ('Transferencia Bancaria', 'Pago mediante transferencia interbancaria'),
      ('PayPal', 'Pago realizado por plataforma PayPal'),
      ('Apple Pay', 'Pago mediante Apple Pay'),
      ('Google Pay', 'Pago mediante Google Pay')`;
    await pool.query(insertPaymentTypes);

    const insertUsers = `INSERT IGNORE INTO users (name, email, created_at, status) VALUES
      ('Juan Perez', 'juan.perez@example.com', NOW(), 1),
      ('Maria Lopez', 'maria.lopez@example.com', NOW(), 1),
      ('Carlos Hernandez', 'carlos.hernandez@example.com', NOW(), 1),
      ('Ana Torres', 'ana.torres@example.com', NOW(), 1),
      ('Luis Gomez', 'luis.gomez@example.com', NOW(), 1),
      ('Laura Jimenez', 'laura.jimenez@example.com', NOW(), 1),
      ('Pedro Sanchez', 'pedro.sanchez@example.com', NOW(), 1),
      ('Sofia Vargas', 'sofia.vargas@example.com', NOW(), 0),
      ('Miguel Diaz', 'miguel.diaz@example.com', NOW(), 0),
      ('Daniela Cruz', 'daniela.cruz@example.com', NOW(), 0)`;
    await pool.query(insertUsers);

    await pool.query('SET FOREIGN_KEY_CHECKS=0');
    await pool.query('DELETE FROM products');
    await pool.query('SET FOREIGN_KEY_CHECKS=1');

    const productos = [
      ['Proteina Whey 1kg','Proteina de suero aislada sabor vainilla Ideal para recuperacion muscular',539.82,50],
      ['Aminoacidos BCAA 300g','BCAA 2:1:1 para soporte durante el entrenamiento',359.82,40],
      ['Creatina Monohidrato 250g','Creatina micronizada para fuerza y potencia',261.00,60],
      ['Multivitaminico Diario','Complejo multivitaminico para uso diario y bienestar general',216.00,80],
      ['Omega-3 1000mg 90 caps','Acidos grasos esenciales para salud cardiovascular',283.50,70],
      ['Pre-entreno Energetico 300g','Mezcla pre-entreno para enfoque y energia',449.82,35],
      ['Glutamina 300g','Glutamina para recuperacion y sistema inmune',297.00,45],
      ['Proteina Vegana 1kg','Mezcla vegetal de pea y arroz sabor chocolate',629.82,30],
      ['Quemador de Grasa 60 caps','Termogenico para apoyar la perdida de grasa',396.00,25],
      ['Colageno Hidrolizado 400g','Colageno para articulaciones y piel',341.82,55],
      ['ZMA 120 caps','Zinc magnesio y vitamina B6 para recuperacion nocturna',243.00,60],
      ['Barritas Proteicas 12 uds','Barritas altas en proteina sabor chocolate',215.82,90],
      ['Proteina Isolada 2kg','Proteina aislada premium para atletas',1079.82,15],
      ['Vitamin C 1000mg 100 tabs','Vitamina C para soporte immunologico',179.82,100],
      ['Electrolitos en Polvo 500g','Recuperacion de electrolitos para hidratacion',229.50,40],
      ['CLA 90 caps','Acido linoleico conjugado para composicion corporal',306.00,30],
      ['Proteina Caseina 1kg','Proteina micelar para liberacion lenta durante la noche',567.00,20],
      ['Vitamina D3 2000 UI 60 caps','Soporte oseo y funcion inmune',153.00,120],
      ['Hierro 30 mg 60 tabs','Suplemento de hierro para anemias y rendimiento',143.82,70],
      ['Omega-3 Kids 60 ml','Aceite de pescado para ninos sabor naranja',197.82,50]
    ];

    const placeholders = productos.map(()=> '(?, ?, ?, ?)').join(', ');
    const valores = productos.flat();
    const sqlInsert = `INSERT INTO products (name, description, price, stock) VALUES ${placeholders}`;
    await pool.query(sqlInsert, valores);

    return { success:true, inserted: productos.length };
  }catch(err){
    return { success:false, error: String(err) };
  }
}

if(require.main === module){
  ejecutarSeed().then(r=>{ if(!r.success) process.exit(1); process.exit(0) });
}

module.exports = { ejecutarSeed };
