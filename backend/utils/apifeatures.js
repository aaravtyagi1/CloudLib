class ApiFeatures {
  constructor(model, queryStr) {
    this.model = model;
    this.queryStr = queryStr;
    this.where = {};
    this.skipCount = 0;
    this.takeCount = undefined;
    this.orderBy = { createdAt: "desc" };
  }

  search() {
    if (this.queryStr.keyword) {
      this.where.name = {
        contains: this.queryStr.keyword,
        mode: "insensitive",
      };
    }
    return this;
  }

  filter() {
    const queryCopy = { ...this.queryStr };
    const removeFields = ["keyword", "page", "limit"];
    removeFields.forEach((key) => delete queryCopy[key]);

    // Handle category filter
    if (queryCopy.category) {
      this.where.category = queryCopy.category;
    }

    // Handle price range filters
    if (queryCopy.price) {
      this.where.price = {};
      if (queryCopy.price.gte !== undefined) this.where.price.gte = Number(queryCopy.price.gte);
      if (queryCopy.price.gt !== undefined) this.where.price.gt = Number(queryCopy.price.gt);
      if (queryCopy.price.lte !== undefined) this.where.price.lte = Number(queryCopy.price.lte);
      if (queryCopy.price.lt !== undefined) this.where.price.lt = Number(queryCopy.price.lt);
    }

    // Handle ratings range filters
    if (queryCopy.ratings) {
      this.where.ratings = {};
      if (queryCopy.ratings.gte !== undefined) this.where.ratings.gte = Number(queryCopy.ratings.gte);
      if (queryCopy.ratings.gt !== undefined) this.where.ratings.gt = Number(queryCopy.ratings.gt);
      if (queryCopy.ratings.lte !== undefined) this.where.ratings.lte = Number(queryCopy.ratings.lte);
      if (queryCopy.ratings.lt !== undefined) this.where.ratings.lt = Number(queryCopy.ratings.lt);
    }

    return this;
  }

  pagination(resultPerPage) {
    const currentPage = Number(this.queryStr.page) || 1;
    this.skipCount = resultPerPage * (currentPage - 1);
    this.takeCount = resultPerPage;
    return this;
  }

  async count() {
    return await this.model.count({
      where: this.where,
    });
  }

  async execute(options = {}) {
    const queryArgs = {
      where: this.where,
      orderBy: this.orderBy,
      ...options,
    };

    if (this.skipCount !== undefined) {
      queryArgs.skip = this.skipCount;
    }
    if (this.takeCount !== undefined) {
      queryArgs.take = this.takeCount;
    }

    return await this.model.findMany(queryArgs);
  }
}

module.exports = ApiFeatures;
