var express = require('express');
var csrf = require('csurf');
var multer = require('multer');
var Post = require('../models/post');
var path = require('path');
var fs = require('fs');
var Comments = require('../models/comment');
var Categories = require('../models/categories');
var users = require('../models/admin');

var router = express.Router();

router.use(function (req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    req.flash('backUrl', '/dashboard' + req.url);
    res.redirect('/admin/login');
});

var upload = multer({
    dest: 'public/images/uploads',
    limits: {fileSize: 2e+6, files: 1},
    fileFilter: fileFilter,
    rename: function (fieldname, filename) {
        return fieldname + filename + Date.now();
    }
});
//TODO: csrf error ..........................
var csrfProtection = csrf({cookie: true});
// router.use(csrfProtection);

router.use(function (req, res, next) {
    req.app.locals.layout = 'dashboard';
    next();
});

router.get('/index', function (req, res, next) {
    res.render('dashboard/index');
});

/**
 *
 * Posts
 *
 */

router.get('/new-post', function (req, res, next) {
    var message = req.flash('error');
    Categories.find(function (err, offer) {
        res.render('dashboard/posts/new-post', {
            csrfToken: 'sad',
            message: message,
            hasError: message.length > 0,
            title: 'درج مطلب جدید',
           category: offer
        });
    });

});

router.post('/new-post', upload.single('image'), function (req, res, next) {
    var messages = [];
    var post = new Post();
    post.user_id = req.user.id;
    post.title = req.body.title;
    post.slug = req.body.slug;
    post.body = req.body.body;
    post.category_id = req.body.category;
    post.created_at = Date.now();
    post.updated_at = Date.now();
    var error = post.validateSync();
    error = error.errors;
    if (error.title) {
        messages.push(error.title.message);
    }
    if (error.slug) {
        messages.push(error.slug.message);
    }
    if (error.body) {
        messages.push(error.body.message);
    }
    var imagePath = null;
    if (!req.file) {
        messages.push('تصویر نمی تواند خالی باشد.');
    } else {
        post.image = req.file.filename;
        imagePath = req.file.path;
    }
    var array = ['0', '1', '10'];
    if (array.includes(req.body.publish) === false) {
        messages.push('وضعیت غیر معتبر است.');
    } else {
        post.publish = req.body.publish;
    }
    Post.findOne({slug: req.body.slug}, function (err, postslug) {
        if (postslug) {
            messages.push('مسیر نمی تواند تکراری باشد، لطفا مسیر دیگری انتخاب کنید.');
        }
        if (messages.length > 0) {
            if (imagePath) {
                fs.unlinkSync(imagePath);
            }
            //TODO: csrf token
            Categories.find(function (err, category) {
                res.render('dashboard/posts/new-post', {
                    csrfToken: 'sad',
                    message: messages,
                    hasError: messages.length > 0,
                    post: post,
                    title: 'درج مطلب جدید',
                    category: category
                });
            });
        } else {
            post.save(function (err, post) {
                console.log(String(err));
                if (err) {
                    if (imagePath) {
                        fs.unlinkSync(imagePath);
                    }
                    req.flash('danger', 'بروز خطا در ذخیره مطلب جدید، دوباره تلاش کنید.');
                } else {
                    req.flash('success', 'با موفقیت ذخیره شد');
                }
                res.redirect('/dashboard/posts');
            });
        }
    });

});

router.get('/posts', function (req, res, next) {
    Post.find().populate('user_id').sort({'_id': 'descending'}).exec(function (err, posts) {
        res.render('dashboard/posts/posts', {
            posts: posts,
            title: 'مطالب',
            helpers: {
                index: function (index) {
                    return ++index;
                },
                status: function (publish) {
                    if (publish === '10') {
                        return 'منتشر شده';
                    } else if (publish === '1') {
                        return 'پیش نویس';
                    } else if (publish === '0') {
                        return 'عدم نمایش';
                    } else {
                        return 'غیر معتبر';
                    }
                }
            }
        });
    });
});

router.get('/post-delete/:postId', function (req, res, next) {
    Post.findByIdAndRemove(req.params.postId, function (err, offer) {
        if (err) {
            res.send(false);
        } else {
            fs.unlinkSync('public/images/uploads/' + offer.image);
            Comments.find({post_id: offer._id}).remove(function (err, remove) {
                res.send(true);

            });
        }
    });
});

router.get('/post-edit/:postId', function (req, res, next) {
    Post.findById(req.params.postId, function (err, data) {
        if (err) {
            req.flash('danger', 'خطا لطفا دوباره تلاش کنید.');
            res.redirect('/dashboard/posts');
        }
        Categories.find(function (err, category) {
            res.render('dashboard/posts/edit', {
                post: data,
                title: ' ویرایش ' + data.title,
                csrfToken: 'sad',
                category: category,
                helpers: {
                    selected: function (publish, item) {
                        console.log('------------>  ' + publish + ' -  ' + item);
                        if (String(publish) === String(item)) {
                            return 'selected';
                        }
                        return '';
                    }
                }
            });
        });
    });
});

router.post('/post-edit/:postId', upload.single('image'), function (req, res, next) {
    Post.findById(req.params.postId, function (err, data) {
        //TODO: Handel Error
        if (err) {

        }
        if (!data) {

        }
        var messages = validateEditPost(req, res, data);
        var oldImage = 'public/images/uploads/' + data.image;
        data.user_id = req.user.id;
        data.title = req.body.title;
        data.slug = req.body.slug;
        data.body = req.body.body;
        data.category_id = req.body.category;
        data.updated_at = Date.now();
        if (messages.length > 0) {
            //TODO: csrf Token
            Categories.find(function (err, category) {
                return res.render('dashboard/posts/edit', {
                    post: data,
                    title: ' ویرایش ' + data.title,
                    csrfToken: 'sad',
                    hasError: messages.length > 0,
                    message: messages,
                    category: category,
                    helpers: {
                        selected: function (publish, item) {
                            console.log('------------>  ' + publish + ' -  ' + item);
                            if (String(publish) === String(item)) {
                                return 'selected';
                            }
                            return '';
                        }
                    }
                });
            });
        } else {
            if (req.file) {
                data.image = req.file.filename;
            }
            data.save(function (err, post) {
                if (err) {
                    if (req.file) {
                        fs.unlinkSync(req.file.path);
                    }
                    messages.push('مسیر نمی تواند تکراری باشد.');
                    Categories.find(function (err, category) {
                        return res.render('dashboard/posts/edit', {
                            post: data,
                            title: ' ویرایش ' + data.title,
                            csrfToken: 'sad', hasError: messages.length > 0,
                            message: messages,
                            category: category,
                            helpers: {
                                selected: function (publish, item) {
                                    if (String(publish) === String(item)) {
                                        return 'selected';
                                    }
                                    return '';
                                }
                            }
                        });
                    });
                } else {
                    if (req.file) {
                        fs.unlinkSync(oldImage);
                    }
                    req.flash('success', 'با موفقیت ذخیره شد');
                }
                res.redirect('/dashboard/posts');
            });
        }
    });
});

router.get('/search-post', function (req, res, next) {
    //TODO: CSRF TOKEN
    if (req.query.title || req.query.slug || req.query.publish || req.query.editor) {
        var query = {};
        if (req.query.title) {
            query['title'] = {$regex: req.query.title};
        }
        if (req.query.slug) {
            query['slug'] = {$regex: req.query.slug}
        }
        if (req.query.editor) {
            query['editor'] = req.query.editor;
        }
        if (req.query.publish) {
            query['publish'] = req.query.publish;
        }
        Post.find(query).populate('user_id').exec(function (err, posts) {
            res.render('dashboard/posts/search', {
                title: 'جستجو مطلب',
                posts: posts,
                helpers: {
                    index: function (index) {
                        return ++index;
                    },
                    status: function (publish) {
                        if (publish === 10) {
                            return 'منتشر شده';
                        } else if (publish === 1) {
                            return 'پیش نویس';
                        } else if (publish === 0) {
                            return 'عدم نمایش';
                        } else {
                            return 'غیر معتبر';
                        }
                    },
                    selected: function (publish, item) {
                        if (publish === String(item)) {
                            return 'selected';
                        } else if (publish === String(item)) {
                            return 'selected';
                        } else if (publish === String(item)) {
                            return 'selected';
                        }
                    }
                },
                search: req.query
            })
        });
    } else {
        return res.render('dashboard/posts/search', {title: 'جستجو مطلب'})
    }
});

/**
 *
 * Comments
 *
 */

router.get('/comments/:id/delete', function (req, res, next) {
    Comments.findByIdAndRemove(req.params.id, function (err, offer) {
        if (!err && offer) {
            req.flash('success', 'با موفقیت حذف شد.');
        } else {
            req.flash('danger', 'خطا لطفا دوباره تلاش کنید.');
        }
        return res.redirect('/dashboard/comments');
    });
});

router.get('/comments/:id/edit', function (req, res, next) {
    Comments.findOne({_id: req.params.id}).populate('post_id').exec(function (err, offer) {
        if (err) {
            return;
        }
        return res.render('dashboard/comments/edit', {
            title: 'ویرایش نظر',
            comment: offer,
            helpers: {
                status: function (status, item) {
                    if (status === item) {
                        return 'selected';
                    }
                    return '';
                }
            }
        });
    });
});

router.post('/comments/:id/edit', function (req, res, next) {
    var array = ['0', '10'];
    if (array.includes(req.body.status) === false) {
        req.flash('danger', 'خطا، لطفا دوباره تلاش کنید.');
        return res.redirect('/dashboard/comments');
    }
    Comments.findOne({_id: req.params.id}, function (err, offer) {
        if (err) {
            return;
        }
        offer.name = req.body.name;
        offer.email = req.body.email;
        offer.body = req.body.comment;
        offer.status = req.body.status;
        offer.save(function (err, result) {
            if (!err && result) {
                req.flash('success', 'با موفقیت ویرایش شد.');
            } else {
                req.flash('danger', 'خطا، لطفا دوباره تلاش کنید.');
            }
            res.redirect('/dashboard/comments');
        });
    });
});

router.get('/comments/search', function (req, res, next) {
    if (req.query.name || req.query.email || req.query.post || req.query.status) {
        var query = {};
        if (req.query.name) {
            query['name'] = {$regex: req.query.name};
        }
        if (req.query.email) {
            query['email'] = {$regex: req.query.email};
        }
        if (req.query.post) {
            query['post_id.title'] = {$regex: req.query.post}
        }
        if (req.query.status) {
            query['status'] = req.query.status;
        }
        Comments.find(query).populate('post_id').exec(function (err, comments) {
            res.render('dashboard/comments/search', {
                title: 'جستجو',
                comments: comments,
                helpers: {
                    index: function (index) {
                        return ++index;
                    },
                    name: function (status) {
                        if (status === 10) {
                            return 'نمایش';
                        }
                        return 'مخفی';
                    },
                    status: function (status, item) {
                        if (status === item) {
                            return 'selected';
                        }
                        return '';
                    }
                }
            });
        });
    } else {
        return res.render('dashboard/comments/search', {
            title: 'جستجو'
        });
    }
});

router.get('/comments', function (req, res, next) {
    Comments.find().populate('post_id').sort({'_id': 'descending'}).exec(function (err, comments) {
        return res.render('dashboard/comments/comments', {
            title: 'مدیریت نظرات',
            comments: comments,
            helpers: {
                index: function (index) {
                    return ++index;
                },
                name: function (status) {
                    if (status === 10) {
                        return 'نمایش';
                    }
                    return 'مخفی';
                }
            }
        });
    });
});

/**
 *
 * Categories
 *
 */

router.get('/categories/view/:id', function (req, res, next) {
    Categories.findById(req.params.id, function (err, offer) {
        //todo: check error ...
        if (err) {
            return;
        }
        if (!offer) {
            return res.redirect(req.header('Referer') || '/dashboard/categories');
        }
        return res.render('dashboard/categories/view', {
            title: ' نمایش ' + offer.name,
            data: offer,
            helpers: {
                status: function (status) {
                    if (status === '10') {
                        return 'نمایش';
                    }
                    return 'مخفی';
                }
            }
        })
    });
});

router.get('/categories/edit/:id', function (req, res, next) {
    Categories.findById(req.params.id, function (err, offer) {
        return res.render('dashboard/categories/edit', {
            title: ' ویرایش ' + offer._id,
            data: offer,
            helpers: {
                select: function (status, item) {
                    if (status === String(item)) {
                        return 'selected';
                    }
                    return '';
                }
            }
        })
    });
});

router.post('/categories/edit/:id', function (req, res, next) {
    Categories.findById(req.params.id, function (err, offer) {
        //todo: check error ...
        offer.name = req.body.name;
        offer.slug = req.body.slug;
        offer.description = req.body.description;
        offer.status = req.body.status;
        var errors = offer.validateSync();
        if (errors) {
            errors = errors.errors;
            var message = [];
            if (errors.name) {
                message.push(errors.name.message);
            }
            if (errors.slug) {
                message.push(errors.slug.message);
            }
            if (errors.description) {
                message.push(errors.description.message);
            }
            if (errors.status) {
                message.push(errors.status.message);
            }
            return res.render('dashboard/categories/edit', {
                title: ' ویرایش ' + offer._id,
                errors: message,
                data: offer,
                helpers: {
                    select: function (status, item) {
                        if (status === String(item)) {
                            return 'selected';
                        }
                        return '';
                    }
                }
            });
        }
        offer.save(function (err, newData) {
            //todo: error check
            if (!err && newData) {
                req.flash('success', 'با موفقیت تغییرات ذخیره شد.')
            } else {
                req.flash('danger', 'خطا، لطفا دوباره تلاش کنید.');
            }
            //todo: check ....
            res.redirect(req.header('Referer') || '/dashboard/categories');
        })
    });
});

router.get('/categories/delete/:id', function (req, res, next) {
    Categories.findByIdAndRemove(req.params.id, function (err, offer) {
        if (!err && offer) {
            req.flash('success', 'با موفقیت حذف شد.');
        } else {
            req.flash('danger', 'خطا لطفا دوباره تلاش کنید.');
        }
        return res.redirect('/dashboard/categories');
    });
});

router.get('/categories/insert', function (req, res, next) {
    return res.render('dashboard/categories/insert', {
        title: 'درج دسته بندی جدید'
    });
});

router.post('/categories/insert', function (req, res, next) {
    var category = new Categories({
        name: req.body.name,
        slug: req.body.slug,
        description: req.body.description,
        status: req.body.status
    });
    var errors = category.validateSync();
    if (errors) {
        errors = errors.errors;
        var message = [];
        if (errors.name) {
            message.push(errors.name.message);
        }
        if (errors.slug) {
            message.push(errors.slug.message);
        }
        if (errors.description) {
            message.push(errors.description.message);
        }
        if (errors.status) {
            message.push(errors.status.message);
        }
        return res.render('dashboard/categories/insert', {
            title: 'درج دسته بندی جدید',
            errors: message,
            data: req.body,
            helpers: {
                select: function (status, item) {
                    if (status === String(item)) {
                        return 'selected';
                    }
                    return '';
                }
            }
        });
    }
    category.save(function (err, data) {
        if (err) {
            req.flash('danger', 'خطا، لطفا دوباره تلاش کنید.');
        } else if (data) {
            req.flash('success', 'با موفقیت ذخیره شد.');
        } else {
            req.flash('danger', 'خطا نا شناخته :(');
        }
        res.redirect('/dashboard/categories')
    });
});

router.get('/categories/search', function (req, res, next) {
    if (req.query.name || req.query.slug || req.query.status) {
        var query = {};
        if (req.query.name) {
            query['name'] = {$regex: req.query.name};
        }
        if (req.query.slug) {
            query['slug'] = {$regex: req.query.slug};
        }
        if (req.query.status) {
            query['status'] = req.query.status || '0';
        }
        Categories.find(query, function (err, offer) {
            //todo: check error
            if (err) {
                return;
            }
            return res.render('dashboard/categories/search', {
                title: 'جستجو',
                search: req.query,
                categories: offer,
                helpers: {
                    index: function (index) {
                        return ++index;
                    },
                    selected: function (status, item) {
                        if (status === String(item)) {
                            return 'selected';
                        }
                        return '';
                    },
                    status: function (status) {
                        if (status === '10') {
                            return 'نمایش';
                        }
                        return 'مخفی';
                    }
                }
            });
        });
    } else {
        return res.render('dashboard/categories/search', {
            title: 'جستجو'
        });
    }
});

router.get('/categories', function (req, res, next) {
    Categories.find(function (err, data) {
        return res.render('dashboard/categories/index', {
            title: 'مدیریت دسته‌بندی ها',
            categories: data,
            helpers: {
                index: function (index) {
                    return ++index;
                },
                status: function (status) {
                    if (status === '10') {
                        return 'نمایش';
                    }
                    return 'مخفی';
                }
            }
        });
    });

});

/**
 *
 * Users
 *
 */

router.get('/users', function (req, res, next) {
    users.find(function (err, users) {
        res.render('dashboard/users/index',{
            title: 'مدیریت کاربران',
            users: users,
            helpers: {
                index: function (index) {
                    return ++index;
                },
                status: function (status) {
                    status = String(status);
                    if (status === '10'){
                        return 'مدیر کل';
                    }else if(status === '9'){
                        return 'مدیر';
                    }else if(status === '1'){
                        return 'نویسنده';
                    }else{
                        return 'غیر فعال';
                    }
                }
            }
        });
    });
});

router.get('/users/delete/:id', function (req, res, next) {
    users.findByIdAndRemove(req.params.id, function (err, offer) {
        //todo: check err not found
        if (err && !offer){
            req.flash('danger', 'خطا، لطفا دوباره تلاش کنید.');
        }else{
            req.flash('success', 'با موفقیت حذف شد.');
            if(offer._id === req.user._id){
                return res.redirect('/admin/logout');
            }
        }
        return res.redirect('/dashboard/users');
    })
});

router.get('/users/edit/:id', function (req, res, next) {
    users.findById(req.params.id, function (err, offer) {
         return res.render('dashboard/users/edit', {
             title: ' ویرایش ' + offer.name,
             user: offer,
             helpers:{
                 selected: function (status, item) {
                     return ((status === String(item)) ? 'selected' : '');
                 }
             }
         });
    });
});

router.post('/users/edit/:id', function (req, res, next) {
    users.findById(req.params.id, function (err, offer) {
        if (err){
            req.flash('danger', 'خطا دوباه تلاش کنید.');
            res.redirect('/dashboard/users');
        }
        offer.name = req.body.name;
        offer.username = req.body.username;
        offer.email = req.body.email;
        offer.status = req.body.status;
        if(req.body.password){
            offer.password = (new users).encryptPassword(req.body.password);
        }
        var errors = offer.validateSync();
        if (errors){
            errors = errors.errors;
            var message = [];
            if (errors.name){
                message.push(errors.name.message);
            }
            if (errors.username){
                message.push(errors.username.message);
            }
            if (errors.email){
                message.push(errors.email.message);
            }
            if (errors.status){
                message.push(errors.status.message);
            }
            if (errors.password){
                message.push(errors.password.message);
            }
            return res.render('dashboard/users/edit', {
                title: ' ویرایش ' + offer.name,
                user: offer,
                message: message,
                helpers:{
                    selected: function (status, item) {
                        return ((status === String(item)) ? 'selected' : '');
                    }
                }
            });
        }else{
            var id = offer._id;
            offer.save(function (err, newDate) {
                if(!err){
                    req.flash('success', 'باموفقیت ذخیره شد.');
                    if(id === req.user._id){
                        console.log('-------------------');
                        return res.redirect('/admin/logout');
                    }
                }else {
                    req.flash('danger', 'خطا دوباره تلاش کنید.');
                }
                return res.redirect('/dashboard/users');
            });
        }
    });
});

router.get('/users/view/:id', function (req, res, next) {
    users.findById(req.params.id, function (err, user) {
        return res.render('dashboard/users/view', {
            title: ' مشخصات ' + user.name,
            user: user,
            helpers: {
                selected: function (status, item) {
                    if (status === String(item)){
                        return 'selected';
                    }
                    return '';
                }
            }
        });
    });
});

router.get('/users/search', function (req, res, next) {
    if(req.query.name || req.query.username || req.query.email || req.query.status){
        var query = {};
        if (req.query.name){
            query['name'] = {$regex: req.query.name};
        }
        if (req.query.username){
            query['username'] = req.query.username;
        }
        if (req.query.email){
            query['email'] = req.query.email;
        }
        if (req.query.status){
            query['status'] = req.query.status;
        }
        users.find(query, function (err, users) {
            return res.render('dashboard/users/search', {
                title: 'جستجو',
                data: req.query,
                users: users,
                helpers: {
                    index: function (index) {
                        return ++index;
                    },
                    selected: function (status, item) {
                        if (status === String(item)){
                            return 'selected';
                        }
                        return '';
                    },
                    status: function (status) {
                        status = String(status);
                        if (status === '10'){
                            return 'مدیر کل';
                        }else if(status === '9'){
                            return 'مدیر';
                        }else if(status === '1'){
                            return 'نویسنده';
                        }else{
                            return 'غیر فعال';
                        }
                    }
                }
            });
        });
    }else{
        return res.render('dashboard/users/search', {
            title: 'جستجو',
            helpers: {
                selected: function (status, item) {
                    if (status === String(item)){
                        return 'selected';
                    }
                    return '';
                }
            }
        });
    }
});

router.get('/users/insert', function (req, res, next) {
    return res.render('dashboard/users/insert',{
        title: 'درج کاربر جدید'
    });
});

router.post('/users/insert', function (req, res, next) {
    var user = new users({
        name : req.body.name,
        username : req.body.username,
        email : req.body.email,
        status : req.body.status,
        password : req.body.password
    });

    var errors = user.validateSync();
    console.log(errors);
    if (errors){
        errors = errors.errors;
        var message = [];
        if (errors.name){
            message.push(errors.name.message);
        }
        if (errors.username){
            message.push(errors.username.message);
        }
        if (errors.email){
            message.push(errors.email.message);
        }
        if (errors.status){
            message.push(errors.status.message);
        }
        if (errors.password){
            message.push(errors.password.message);
        }
        return res.render('dashboard/users/insert',{
            title: 'درج کاربر جدید',
            message: message,
            old: req.body,
            helpers: {
                selected: function (status, item) {
                    if (status === String(item)){
                        return 'selected';
                    }
                    return '';
                }
            }
        });
    }else{
        user.password = user.encryptPassword(user.password);
        user.save(function (err, done) {
            if(!err && done){
                req.flash('success', 'با موفقیت ذخیره شد.');
            }else{
                req.flash('danger', 'خطا، لطفا دوباره تلاش کنید.');
            }
            return res.redirect('/dashboard/users');
        });
    }
});

module.exports = router;

function fileFilter(req, file, cb) {
    var filetypes = /jpeg|jpg/;
    var mimetype = filetypes.test(file.mimetype);
    var extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
        return cb(null, true);
    }
    cb(null, false);
}

function validateEditPost(req, res, post) {
    var messages = [];
    req.checkBody('title').notEmpty().withMessage('عنوان نمی تواند خالی باشد.');
    req.checkBody('slug').notEmpty().withMessage('مسیر نمی تواند خالی باشد.');
    req.checkBody('body').notEmpty().withMessage('متن نمی تواند خالی باشد.');
    var errors = req.validationErrors();
    if (errors) {
        errors.forEach(function (item) {
            messages.push(item.msg);
        });
    }
    var array = ['0', '1', '10'];
    if (array.includes(req.body.publish) === false) {
        messages.push('وضعیت غیر معتبر است.');
    } else {
        post.publish = req.body.publish;
    }
    return messages;
}
