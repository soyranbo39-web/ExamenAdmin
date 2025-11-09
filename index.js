const express = require('express')
const app = express()
const port = process.env.PORT ? Number(process.env.PORT) : 3000

app.use(express.json())

app.use((req, res, next)=>{
    res.setHeader('Access-Control-Allow-Origin','*')
    res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization')
    if(req.method==='OPTIONS') return res.sendStatus(200)
    next()
})

const pool = require('./connection')
app.get('/',(req,res)=>res.send('API de productos - funcionando'))
const purchasesRouter = require('./purchases')
app.use(purchasesRouter)

app.get('/api/products',async(req,res)=>{
    try{
        const [rows] = await pool.query('SELECT id,name,description,price,stock,created_at FROM products')
        res.json(rows)
    }catch(e){
        res.status(500).json({ error: 'Error interno' })
    }
})

app.get('/api/products/:id',async(req,res)=>{
    try{
        const [rows] = await pool.query('SELECT id,name,description,price,stock,created_at FROM products WHERE id=?',[req.params.id])
        if(rows.length===0) return res.status(404).json({ error: 'Producto no encontrado' })
        res.json(rows[0])
    }catch(e){
        res.status(500).json({ error: 'Error interno' })
    }
})

app.post('/api/products',async(req,res)=>{
    const { name, description, price, stock } = req.body
    if(!name || price==null) return res.status(400).json({ error: 'name y price son obligatorios' })
    try{
        const sql = 'INSERT INTO products (name, description, price, stock, created_at) VALUES (?, ?, ?, ?, NOW())'
        const [result] = await pool.query(sql,[name, description||null, price, stock||0])
        res.status(201).json({ id: result.insertId })
    }catch(e){
        res.status(500).json({ error: 'Error interno' })
    }
})

app.put('/api/products/:id',async(req,res)=>{
    const { name, description, price, stock } = req.body
    try{
        const [result] = await pool.query('UPDATE products SET name=?, description=?, price=?, stock=? WHERE id=?',[name, description, price, stock, req.params.id])
        if(result.affectedRows===0) return res.status(404).json({ error: 'Producto no encontrado' })
        res.json({ message: 'Actualizado' })
    }catch(e){
        res.status(500).json({ error: 'Error interno' })
    }
})

app.delete('/api/products/:id',async(req,res)=>{
    try{
        const [result] = await pool.query('DELETE FROM products WHERE id=?',[req.params.id])
        if(result.affectedRows===0) return res.status(404).json({ error: 'Producto no encontrado' })
        res.json({ message: 'Eliminado' })
    }catch(e){
        res.status(500).json({ error: 'Error interno' })
    }
})

app.get('/usuarios',async(req,res)=>{
    try{
        const [rows] = await pool.query('SELECT id, name, email, created_at, status FROM users')
        res.json(rows)
    }catch(e){
        console.error('/usuarios GET error', e)
        res.status(500).json({ error: 'Error interno' })
    }
})

app.post('/usuarios',async(req,res)=>{
    const { nombre, name, email, telefono, edad, status } = req.body
    const userName = nombre || name
    if(!userName || !email) return res.status(400).json({ error: 'nombre y email obligatorios' })
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if(!emailRegex.test(email)) return res.status(400).json({ error: 'email invalido' })
    try{
        const userStatus = status == null ? 1 : status
        const [result] = await pool.query('INSERT INTO users (name, email, created_at, status) VALUES (?, ?, NOW(), ?)',[userName, email, userStatus])
        res.status(201).json({ id: result.insertId })
    }catch(e){
        if(e.code==='ER_DUP_ENTRY') return res.status(409).json({ error: 'email duplicado' })
        console.error('/usuarios POST error', e)
        res.status(500).json({ error: 'Error interno' })
    }
})

app.post('/setup/run',async(req,res)=>{
    try{
    console.log('setup/run: start')
    const { ejecutarSeed } = require('./Productos')
    const result = await ejecutarSeed()
    console.log('setup/run: seed finished', result && result.success)
        if(result.success) return res.json({ message: 'Seed ejecutado', inserted: result.inserted })
        res.status(500).json({ error: result.error })
    }catch(e){
    console.error('setup/run error', e)
        res.status(500).json({ error: 'Error interno' })
    }
})

app.listen(port,()=>console.log(`App listening at http://localhost:${port}`))